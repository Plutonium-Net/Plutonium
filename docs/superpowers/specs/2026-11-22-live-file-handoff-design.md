# Plutonium Drop — live file handoff

Date: 2026-11-22
Status: design approved, spec revised for a standalone Node service

## 1. Summary

A file transfer that only exists while both people are present. One client picks a
file, names a recipient's `share_id`, and the bytes stream through a standalone Node
server to the other client's socket. No file bytes are stored anywhere; the receiver
writes to disk as they arrive, starting at byte zero.

**The pitch, in one line:** a phone call for files, not an inbox.

Consequences, all features rather than side effects:

- The receiver is done when the sender is done. No upload wait, no second download.
- No storage bill, no expiry policy, no retention job, no cleanup cron.
- Nothing to leak afterwards, because no file was ever kept.
- If either side closes the tab, the transfer is gone. That is the tradeoff, and the UI
  says so out loud instead of hiding it.

This service is a **separate Node process**, not a Cloudflare Worker. It is not part of
the `api/` Worker and shares no runtime with it. §5 covers what that buys and what it
costs.

## 2. What makes it unlike the usual file transfer

1. **Live-only.** Every other service is store-then-download. This one refuses to store.
2. **Addressed to a person, not a link.** You send to `plu_7f3k9m2x`, not to a URL with a
   secret in it. The URL is an address you can post anywhere.
3. **Two progress bars.** *Sent* (handed to the socket) and *confirmed* (the receiver
   wrote it). Most tools show only the first, which is why they feel dishonest.
4. **Resume is nearly free.** The sender reads from the file by offset, so reconnecting
   resumes at a sequence number rather than a byte count it has to guess.
5. **Phase 2: the relay can't read it.** Designed for, not built yet (§17).

## 3. Non-goals for v1

Multiple files per session, folders, fan-out to several receivers, offline/queued
delivery, permanent links, a native or CLI client, WebRTC, any storage of file bytes — no
S3, no disk spool — server-side previews or thumbnails, resumable-forever downloads.
Metadata that *is* stored (a key verifier, a device token hash, a lockout counter) is
listed where it lives and never includes file content.

## 4. Locked decisions

| Decision | Value |
| --- | --- |
| Runtime | Standalone Node 24 LTS process, plain `node:http` + `ws` |
| Hosting | Render.com Web Service (Docker-compatible anywhere), one instance |
| Transport | Relay: sender socket → server → receiver socket |
| Direct P2P | Deferred; the transport sits behind an interface |
| Identity | Firebase session + usermade `share_key` |
| `share_id` | Server-generated, immutable, public, resolvable only by exact id |
| Key derivation | PBKDF2-SHA256 600k in the browser, scrypt N=2^15 r=8 p=3 on the server |
| Pickup window | 120 seconds, with a visible countdown on both ends |
| E2E encryption | Phase 2; the envelope is designed to accept it |
| Chunk size | 256 KiB |
| In-flight window | 16 chunks (4 MiB), gated by real socket backpressure |
| Ack cadence | every 8 chunks or 50 ms, whichever comes first |
| npm dependencies | one: `ws` |

## 5. Runtime: a real process instead of a Worker

### 5.1 What moving off Workers buys

- **The PBKDF2 ceiling disappears.** Workers reject iteration counts above 100,000 and
  `wrangler dev` does not reproduce it. Node has no such cap, so the KDF can be chosen on
  merit rather than on what a runtime permits (§6.3).
- **No message-size ceiling.** 32 MiB per WebSocket message was never a problem at
  256 KiB, but it is no longer a design input.
- **No duration billing.** A 27-minute transfer cost roughly 207 GB-s on a Durable
  Object. Here it costs bandwidth and a slice of one vCPU, which is the honest cost.
- **No hibernation semantics.** Idle presence no longer needs an API designed around
  eviction; it needs a heartbeat (§8).
- **Real backpressure.** A Durable Object forwarding to a second hop cannot see the
  receiver's socket buffer. A Node process owns both sockets and can gate on the
  destination's send callback (§10).

### 5.2 What it costs

- **One event loop is a shared resource.** Any synchronous work during a transfer stalls
  every other session. This is the defining constraint of a relay written in Node, and
  §5.3 makes it a rule.
- **One process means one machine.** Horizontal scaling would break in-memory sessions.
  v1 is a single instance, stated plainly rather than discovered at scale.
- **Node's WebSocket server is not built in.** `ws` is the one added dependency.
- **No edge.** Every byte crosses the region the service runs in, twice: once inbound,
  once outbound. On a metered plan that doubling is the dominant cost (§15).

### 5.3 The no-blocking rule

Nothing CPU-bearing runs on the main thread while sessions are live.

- Password KDFs use `crypto.scrypt` **async** (libuv thread pool), never `scryptSync`.
- The client's stage-one PBKDF2 runs in a Web Worker in every browser, so a 600k
  derivation does not freeze the shell.
- No synchronous `fs`, no `node:sqlite` synchronous query inside a relay path, no
  `JSON.stringify` of large structures. SQLite writes are small and infrequent, but they
  are `DatabaseSync` calls, so they are confined to the identity paths where no transfer
  is in flight, and batched where possible.
- `UV_THREADPOOL_SIZE=8` so concurrent unlocks do not queue behind four default threads.

A test hammers the relay with a 200 MB transfer while running 20 simultaneous unlocks and
asserts the transfer's throughput does not drop more than 10%.

## 6. Identity: hardening the usermade key

A usermade key is a password. It is the weakest part of the design, so it gets the most
constraint. This section is normative.

### 6.1 Credential model

- `share_id` — generated at first use, 8 characters from the games alphabet
  (`A-HJ-NP-Z2-9`, reusing the alphabet in `api/routes/rooms.js`), prefixed `plu_`.
  Public. Immutable. An address, not a credential: `drop.plutoniumnet.work/plu_7f3k9m2x`
  can be posted publicly, because receiving requires a session *as* that person.
- `share_key` — usermade, never stored, never logged, never in a URL or query string.
  Unlocked once per device, then replaced by a device token (§6.8).

Two factors in practice: the Firebase session proves the account, the key proves it is
really you on this device. Neither alone is enough to receive.

### 6.2 Key policy

Enforced on the client for feedback and re-enforced on the server, because client
validation is a UI convenience and not a control.

- Length 16–128 characters, counted as Unicode code points after normalization.
- Rejected: equal to or containing the `share_id`; a single repeated character; a
  monotonic run (`abcdef…`, `123456…`); any of the 1,000 most common passwords (bundled
  list, client-side for UX, server-side for enforcement).
- No forced composition classes. They measurably produce worse keys.
- Any Unicode allowed, normalized to NFKC before use so `é` composed and decomposed are
  the same key. Encode UTF-8 after normalizing. Normalize once, in one place.
- A strength hint while typing. It is advice; the floor is the rules above.
- Creation asks for the key twice, stores no copy, and shows the key-reuse warning
  (§6.10) at that moment, once, in plain words.

### 6.3 Derivation: two stages, for a different reason than before

On Workers this split existed to dodge a 100,000-iteration cap. Node has no cap, so the
split now earns its place on a different argument: **the server never receives the key.**

```
client:  K = PBKDF2-SHA256(NFKC(key), salt = "plu-drop:v1:" + share_id, 600_000, 32 B)
server:  D = scrypt(K, salt = salt_srv, N = 2^15, r = 8, p = 3, maxmem = 64 MiB, 32 B)
         V = HMAC-SHA256(pepper, D)                      # pepper = env secret
         store "v1$pbkdf2s256-600k$scrypt-15-8-3" plus salt_srv and V
```

Why each choice:

- **Why the client stage exists.** The server never holds the key, so a database *and*
  pepper leak does not expose a string the user may have reused elsewhere. `PBKDF2` is
  what browsers actually expose in WebCrypto; there is no scrypt there, and shipping a
  WASM scrypt to every client is not worth it for a once-per-device cost.
- **Why scrypt on the server.** It is memory-hard, built into Node, async on the thread
  pool, and needs no native module. N=2^15, r=8, p=3 is OWASP-aligned for roughly 32 MiB
  of memory per derivation, which fits comfortably in a 512 MB instance even with eight
  concurrent unlocks.
- **Why the salt is bound to the id.** `plu-drop:v1:` + `share_id` means the same typed
  key yields different digests for different accounts, and a captured digest is useless
  against any other account.
- **Why the params live in the record.** The version string carries both work factors, so
  an older record verifies at its own cost and is rehashed to current parameters on
  success. Raising cost later never invalidates anyone.

The pepper (`DROP_KEY_PEPPER`) is a service env var, never in the repo, never in a config
file. Losing it invalidates every key; that is in the runbook, not discovered.

Honest limit: two-stage hashing bounds an attacker who holds both the database and the
pepper to pass-the-hash against *this* service. It is not a substitute for a good key,
which is why the lockout in §6.6 does more work than either KDF.

### 6.4 Timing and work budget

Client stage: ~400 ms on a laptop, in a worker, once per device.
Server stage: ~150 ms on the thread pool, non-blocking, once per unlock attempt —
including failed ones, which is what makes the timing uniform (§6.5).

### 6.5 Verification

Constant-time comparison over equal-length buffers — never `===` on derived bytes, never
an early return on length mismatch before the compare is padded.

If the `share_id` does not exist, run both stages against a fixed dummy salt and a fixed
dummy verifier, then fail. Unknown-account and wrong-key responses must be
indistinguishable in text, status code and timing: one error, `That key didn't work.`,
HTTP 401, `Cache-Control: no-store`.

### 6.6 Lockout and rate limits

The threat is online guessing against a human-chosen string, so the counter is the real
control.

- Per share: 5 failed unlocks in 15 minutes → locked 15 minutes. Each further failure
  doubles the lock (15 m, 30 m, 1 h, 2 h, 4 h), capped at 24 hours. Success clears it.
- Per IP: 20 failed unlocks in 10 minutes across all shares, to stop spraying many
  accounts from one host. `X-Forwarded-For` is trusted only from the platform's proxy;
  otherwise the socket address is used.
- Counters live in SQLite inside a single `BEGIN IMMEDIATE … COMMIT`, so
  increment-and-check is atomic across concurrent requests. This is the one place an
  in-memory map will not do: two parallel guesses must not both read `count: 0`.
- Lockout responses are generic and carry `Retry-After`. A lockout never reveals whether
  the key was close.

### 6.7 Enumeration

Unlock (§6.5) is one opaque answer. The *send* endpoint is inherently an oracle — you
must know whether `plu_7f3k9m2x` exists before offering it a file — so it is scoped
tightly: authenticated only, 30 lookups/hour/uid, returning `{ share_id, display_name }`
and nothing else. No email, no last-seen, no account age. The residual risk (you can
confirm an id exists) is accepted and written down rather than argued away.

### 6.8 Device tokens

Retyping a 16-character key before every file would kill the product, so unlock mints a
credential once:

- On success the server generates 32 random bytes, returns them exactly once as
  `device_token`, and stores only `SHA-256(token)` with a 30-day expiry in a `devices`
  row on the share.
- The client keeps it in IndexedDB — not `localStorage`, not a cookie, never a URL — and
  presents it as the bearer credential for receiving.
- Server-side use is a hash lookup plus an expiry check, so no KDF runs on the transfer
  path. The scrypt cost stays confined to unlock.
- A user can revoke one device without touching the others.

### 6.9 Rotation

`POST /drop/keys/rotate` requires the current key, then writes a new `salt_srv` and
`verifier`, bumps `rotated_at`, revokes every device token, and cancels pending offers.
Because no file bytes are at rest, rotation cannot orphan anything. Phase 2 note:
rotation also invalidates the published encryption public key (§17), which must then be
re-derived and re-verified.

### 6.10 What this protects, and what it does not

Protects: the key is never stored, never transmitted, never logged; a database leak alone
does not yield it; brute force is throttled and locked out; a stolen session alone cannot
receive.

Does not protect: whoever holds both the session and the key can receive files addressed
to that id, and because delivery destroys the transfer there is nothing to recover
afterwards. The UI states this at key creation, once, without a modal.

### 6.11 Phase-2 separation

When encryption arrives, the encryption identity is derived from the *same* key with HKDF
and a distinct `info` string:

```
enc_priv = HKDF-SHA256(ikm = K, salt = share_id, info = "plu-drop/enc/v1", 32 bytes)
```

so the authentication verifier and the encryption key never coincide. Rotating the key
rotates both; the purposes stay separated by domain string, never by convention.

## 7. Components

A separate directory tree, deployed on its own: `drop-server/`. The web client stays in
the existing shell under `src/`.

| Unit | Job | Depends on |
| --- | --- | --- |
| `drop-server/src/http.js` | Routing, CORS, Origin allowlist, health check | node:http |
| `drop-server/src/auth.js` | Firebase ID token verification, ported from `api/lib/token.js` | node:crypto |
| `drop-server/src/identity.js` | Key policy, scrypt, records, lockout, device tokens, rotation | node:sqlite |
| `drop-server/src/db.js` | Schema, migrations, prepared statements | node:sqlite |
| `drop-server/src/registry.js` | Presence map, heartbeat, session map, offer sweeper | ws |
| `drop-server/src/session.js` | Seats, frame pump, acks, resume, teardown | frames |
| `drop-server/src/frames.js` | Binary header encode/decode, CRC32C | nothing |
| `drop-server/src/tickets.js` | HMAC room tickets | node:crypto |
| `src/lib/drop/identity.ts` | Key policy, NFKC, stage-one PBKDF2 in a worker, device token storage | WebCrypto |
| `src/lib/drop/sender.ts` | Read by offset, chunk, window, retransmit | identity |
| `src/lib/drop/receiver.ts` | Sink selection, ordered write, ack, resume | identity |
| `src/lib/drop/sink.ts` | `showSaveFilePicker` vs OPFS behind one interface | nothing |
| `src/apps/drop/*` | The screen: pick a person, pick a file, two bars | all of the above |

The pump knows nothing about identity. The registry knows nothing about bytes. The sink
knows nothing about the wire. Each is testable in a few lines, and `frames.js` alone has
no imports at all.

Firebase token verification is ported rather than added as a dependency: `node:crypto`'s
`createPublicKey({ format: 'jwk' })` does exactly what the Worker version does by hand,
and the existing logic is ~120 lines with an already-understood cache policy. That keeps
the dependency list at one.

## 8. Presence

Every signed-in client holds one WebSocket to `/drop/inbox` while the shell is open. The
socket carries presence and offers only, never bytes.

- Registration is keyed by `share_id`, in a `Map<share_id, socket>` on the registry.
- **Heartbeat is mandatory.** `ws` does not ping for you. Every 30 s the server sends a
  ping and clears an `isAlive` flag; a client that misses two consecutive pongs is
  terminated and deregistered. Without this a laptop lid closing leaves a ghost who
  appears online forever — on a Worker, hibernation hid this; here nothing does.
- A second connection for the same `share_id` replaces the first, and the first is told
  it was superseded.
- Presence is per-region and per-instance, which is correct for a single instance and the
  first thing that breaks if the service is ever scaled out.

## 9. Offer handshake, 120-second window

1. Sender picks a file and a recipient, then `POST /drop/offers`.
2. Server authenticates, rate-limits, looks up the recipient, mints `session:<random>`,
   records the offer in memory with a 120 s expiry, and knocks on the recipient's inbox.
   The response carries the sender's room ticket, so the sender connects and waits at
   once — the room is occupied before the recipient has even seen the offer.
3. Recipient sees who, what, how big, and a countdown matching the sender's. Accept or
   decline.
4. On accept, the server mints two short-lived tickets — HMAC over
   `{session, role, exp: now+60}` — one to the room endpoint for each side. A ticket is
   the only way into a room, so a guessed session id is worthless.
5. The sender is already seated from step 2, so the room is full and the pump starts.
6. At 120 s with no accept, the offer expires, the room tears down, and the sender is told
   nobody picked up.

Offers live in an in-memory map with a single sweeper interval, not a timer per offer —
thousands of pending timers is a classic way to leak memory in a long-lived process.
Declining is a first-class outcome with its own copy, not an error. A recipient who is
offline is told so immediately rather than being made to wait out the countdown.

Browsers cannot set an `Authorization` header on a WebSocket. The ticket therefore
travels as `?ticket=` on the upgrade URL, which puts it in access logs — acceptable
because it is single-use and lives 60 seconds, and stated here so nobody lengthens it
later without noticing.

## 10. Wire protocol

Control is JSON text frames; data is binary frames. Both directions.

Binary header, 12 bytes, big-endian:

```
0-3   seq        uint32    chunk index, 0-based
4     flags      uint8     bit0 = final chunk
5     reserved   uint8     must be 0
6-7   length     uint16    payload length, defensive check against the frame size
8-11  crc        uint32    CRC32C of the payload
```

Payload follows immediately, up to 256 KiB. `ws` gets `maxPayload` pinned to 256 KiB plus
the header, so an oversized frame closes the connection instead of buffering.

Control messages: `hello{role}`, `meta{name,size,type,lastModified,chunkSize}`, `ready`,
`ack{seq,received}`, `resume{from}`, `pause`, `cancel{reason}`, `done{bytes}`,
`error{code}`.

**Backpressure is one chunk deep.** The server does not buffer. It calls
`dst.send(frame, cb)` for exactly one chunk and does not read the next frame from the
sender until that callback fires. If the receiver's disk stalls, the callback stalls, the
sender's socket fills, TCP pushes back on the sender, and `file.slice()` simply stops
being called. No queues, no `bufferedAmount` polling heuristic, no unbounded memory.
This is the single biggest improvement over the Worker design and the reason the relay can
promise a flat memory profile.

The 16-chunk window is therefore a *sender-side* limit that bounds how much work is in
flight before an ack, not a server-side queue. Acks are batched every 8 chunks or 50 ms.
An ack means *written to the sink*, not *received by the socket* — that is what makes the
second progress bar honest.

Resume: after a reconnect, the receiver sends `resume{from: seq}`; the sender seeks with
`file.slice(seq * chunkSize)` and continues. No bookkeeping beyond a sequence number,
because the source is a file and seeking is free.

Integrity: per-chunk CRC32C plus a total byte count at `done`. There is no streaming
SHA-256 in WebCrypto and none in `node:crypto` without a state object per transfer; the
spec does not claim what it cannot do. Whole-file hashing, if wanted later, needs an
incremental implementation and is a separate decision.

Ordering: the receiver writes strictly in sequence order, holding out-of-order arrivals in
a reorder buffer bounded by the window.

## 11. Sender pump

Read from the `File` by offset in 256 KiB slices, keep at most 16 unacked, retransmit a
chunk whose ack never arrives, and never read the file into memory. The source may be
arbitrarily large; the sender's footprint stays at the window size.

The sender's tab must stay open for the duration. That is inherent, and the UI says so
before the transfer starts rather than after it fails.

## 12. Receiver sink

One interface: `open(meta) → { write(seq, bytes), close(), abort() }`.

- Chromium: `showSaveFilePicker()` *before* the transfer starts, so a long transfer is
  never lost to a late permission prompt, then stream through `createWritable()`.
- Firefox 111+ and Safari 15.2+: OPFS with `createSyncAccessHandle()` in a dedicated
  worker, then hand the finished file out as a download and delete the temp on success.
  Still disk-backed, so the memory ceiling mostly dissolves. Verified Baseline since
  March 2023, worker-only, secure context.
- Both pumps run in Web Workers so the shell stays responsive; `File` is
  structured-cloneable into a worker and `slice()` works there.
- No cross-origin isolation needed. `vite.config.js` sends `COOP`/`COEP` as `unsafe-none`
  and nothing here wants `SharedArrayBuffer`.
- If neither sink exists, refuse to receive above 512 MB rather than pretend.

## 13. Failure modes

| Failure | Behaviour |
| --- | --- |
| Recipient offline | Immediate "not online right now"; no offer stored |
| Offer not accepted in 120 s | Expires with a countdown; sender sees "no pickup" |
| Recipient declines | Explicit, with copy saying nothing was sent |
| Sender closes tab | Receiver keeps what it has, is told the transfer stopped |
| Receiver closes tab | Sender is told; nothing to resume unless they reopen in-session |
| Network blip | Reconnect with a fresh ticket, `resume{from: seq}`, continue |
| Disk write fails | Session aborts with the reason surfaced; partial file left where chosen |
| Server redeployed (SIGTERM) | 30 s graceful window: stop accepting, send `error{code:'restart'}`, close. Clients reconnect and resume; sessions that cannot resume end honestly |
| Instance restarts / OOM | Same as above without the warning; clients see a drop and retry once |
| Ghost presence | Impossible to leave silently — the heartbeat reaps it in 60 s |

Partial files are never deleted without telling the user. A half-received 4 GB file is
still their file.

## 14. Deployment

- Render Web Service, Docker or Node runtime, `npm start`, health check `/healthz`.
  All traffic on one port; WebSockets ride the same port as HTTP.
- **Single instance.** In-memory sessions and presence mean two instances would each know
  half the truth. Free instances cannot scale past one anyway; scaling later requires
  sticky routing by session id or a shared store, and that is a separate decision.
- **Free tier is a demo, not a deployment.** A free instance spins down after 15 minutes
  without inbound traffic and takes about a minute to wake. WebSocket messages count as
  traffic, so an active transfer keeps it alive — but idle presence does not, and the
  filesystem is ephemeral, so the SQLite identity database would vanish on redeploy.
  Losing every user's key record on a deploy is not acceptable, so: **Starter or above
  with a persistent disk at `/data`, `DROP_DB=/data/drop.db`.**
- Env: `DROP_KEY_PEPPER`, `DROP_TICKET_SECRET`, `FIREBASE_PROJECT_ID`,
  `DROP_ORIGINS` (comma-separated allowlist), `DROP_DB`, `PORT`.
- **Origin allowlist on upgrade.** Cross-site WebSocket hijacking is real: browsers send
  cookies and any page can open a socket to your endpoint. The `Origin` header is checked
  against `DROP_ORIGINS` on every upgrade, presence and room alike, and a mismatch is
  refused before the handshake completes.
- CORS stays header-based (`Authorization: Bearer`), so `Access-Control-Allow-Origin` can
  name the shell origin explicitly rather than `*`.
- `SIGTERM` sets a draining flag immediately; `SIGINT` the same for local runs.

## 15. Limits and cost

- 30 offers/hour/uid; 3 concurrent sessions/uid; a per-IP connection cap.
- No hard size cap. A warning and a visible time estimate above 2 GB.
- **Bandwidth is now the dominant cost, and it is doubled.** Every byte crosses the server
  twice: once inbound from the sender, once outbound to the receiver. A 2 GB file is 2 GB
  in and 2 GB out, which on a metered plan is 2 GB of billable egress — and a free
  instance's 5 GB/month works out to roughly 2.5 GB of actual file transfers. This is a
  sharper constraint than the Durable Object duration billing it replaces, and it is the
  main argument for revisiting WebRTC later.
- Memory is flat by design (§10): two sockets, one 256 KiB frame buffer per session.

## 16. Testing

- `node:test` throughout; no new test framework.
- Key policy table tests: accept/reject, NFKC equivalence, code points vs bytes.
- Derivation vectors pinned for both stages, plus a test that scrypt params live in the
  stored version string and an older record still verifies.
- Lockout arithmetic including the doubling schedule, the cap, and the reset on success.
- Concurrency test: 20 parallel failed unlocks against one share must not exceed the
  threshold, proving the transaction is atomic.
- Constant-time compare, and unknown-share responses identical to wrong-key responses.
- Frame round-trip, CRC mismatch, malformed and oversized length rejection.
- Window/ack logic as pure functions — no sockets.
- Two-client integration test on a real socket pair with a forced drop at chunk 100 and a
  resume that proves the bytes match.
- The no-blocking test from §5.3: transfer throughput must not drop >10% while 20 unlocks
  run.
- A 1 GB soak asserting flat RSS.

## 17. Phase 2: end-to-end encryption

Designed for now, built later.

- Each share publishes an X25519 public key derived per §6.11; the private half never
  leaves the device and is unlocked by the key.
- Sender derives a shared secret, then an AEAD key per chunk from a counter, and sends
  ciphertext. The relay moves opaque bytes.
- **A fingerprint is mandatory, not optional.** Both sides display four words derived from
  the public key, verified once out of band. Without that check, a malicious relay
  substitutes its own key and the encryption is decoration. The fingerprint exchange is
  the feature; the cipher is the easy part.
- Because nothing is at rest, rotation breaks only in-flight and pending exchanges.

## 18. Risks

1. A usermade key is a password and people reuse passwords. The two-stage derivation means
   a leak costs this service and not others, but it does not make a weak key strong.
2. The send endpoint confirms whether an id exists. Rate-limited, authenticated,
   documented; not eliminated.
3. Both tabs must stay open. Inherent, and it is the same property that makes the product
   trustworthy.
4. Single instance. A restart ends every live session, and a redeploy is a restart. The
   graceful window (§14) makes that survivable but not invisible.
5. Bandwidth doubling means the service costs money in proportion to what people send,
   which store-then-download would not.
6. `node:sqlite` is a release candidate, and its API is still moving — `DatabaseSync` was
   renamed in Node 26.11. Pin the Node major in `.nvmrc` and CI, and read the changelog on
   upgrade.

## 19. Build order

1. `frames.js` + pure window/ack logic, with tests. No networking.
2. `db.js` and `identity.js`: schema, policy, two-stage derivation, lockout, device
   tokens, rotation.
3. `session.js` pump over a local Node process, two headless clients, one file.
4. `registry.js` presence, heartbeat, and the 120 s offer handshake.
5. Sender and receiver pumps, Chromium sink, then the OPFS fallback.
6. The screen, the two progress bars, and the honest copy.
7. `http.js` hardening: Origin allowlist, CORS, draining on SIGTERM, `/healthz`.
8. Soak test at 1 GB, then the phase-2 envelope.
