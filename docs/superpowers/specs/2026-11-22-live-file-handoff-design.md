# Plutonium Drop — live file handoff

Date: 2026-11-22
Status: design approved, spec revised for a queued, one-transfer-per-server Node service

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
- **Every server runs exactly one transfer at a time.** A transfer gets the whole
  machine, and the wait for one is visible and numbered instead of silently degrading
  everyone's throughput. Capacity is added by adding servers, not by sharing one.

This service is a **separate Node process**, not a Cloudflare Worker. It is not part of
the `api/` Worker and shares no runtime with it. §5 covers what that buys and costs.

## 2. What makes it unlike the usual file transfer

1. **Live-only.** Every other service is store-then-download. This one refuses to store.
2. **Addressed to a person, not a link.** You send to `plu_7f3k9m2x`, not to a URL with a
   secret in it. The URL is an address you can post anywhere.
3. **One transfer per server, with a real queue.** No shared pipe and no mystery slowness:
   you are first, second, or third, and the estimate says so.
4. **Two progress bars.** *Sent* (handed to the socket) and *confirmed* (the receiver
   wrote it). Most tools show only the first, which is why they feel dishonest.
5. **Resume is nearly free.** The sender reads from the file by offset, so reconnecting
   resumes at a sequence number rather than a byte count it has to guess.
6. **Phase 2: the relay can't read it.** Designed for, not built yet (§18).

## 3. Non-goals for v1

Multiple files inside one session, folders, fan-out to several receivers, offline/queued
delivery across sessions, permanent links, a native or CLI client, WebRTC, any storage of
file bytes — no S3, no disk spool — server-side previews, resumable-forever downloads, a
queue that survives a restart. Metadata that *is* stored (a key verifier, a device token
hash, a lockout counter) is listed where it lives and never includes file content.

## 4. Locked decisions

| Decision | Value |
| --- | --- |
| Runtime | Standalone Node 24 LTS process, plain `node:http` + `ws` |
| Hosting | Render.com Web Services (Docker-compatible anywhere), N instances |
| Concurrency | Exactly one active transfer per server; the rest wait in a FIFO queue |
| Transport | Relay: sender socket → server → receiver socket |
| Direct P2P | Deferred; the transport sits behind an interface |
| Identity | Firebase session + usermade `share_key` |
| `share_id` | Server-generated, immutable, public, resolvable only by exact id |
| Key derivation | PBKDF2-SHA256 600k in the browser, scrypt N=2^15 r=8 p=3 on the server |
| Pickup window | 120 seconds, with a visible countdown on both ends |
| Queue wait cap | 10 minutes, then the job expires and the pair is told |
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
  destination's send callback (§11).

### 5.2 What it costs

- **One event loop is a shared resource.** Any synchronous work during a transfer stalls
  it. This is the defining constraint, and §5.3 makes it a rule. The one-transfer rule in
  §10 turns out to help here rather than hurt: with a single pump alive, the relay has
  the whole loop.
- **One transfer per process.** Horizontal capacity comes from running more servers, which
  means routing rules — presence must be findable, sessions must be reachable (§15.2).
- **Node's WebSocket server is not built in.** `ws` is the one added dependency.
- **No edge.** Every byte crosses the region the service runs in twice: once inbound, once
  outbound. On a metered plan that doubling is the dominant cost (§16).

### 5.3 The no-blocking rule

Nothing CPU-bearing runs on the main thread while a transfer is live.

- Password KDFs use `crypto.scrypt` **async** (libuv thread pool), never `scryptSync`.
- The client's stage-one PBKDF2 runs in a Web Worker, so a 600k derivation does not freeze
  the shell.
- No synchronous `fs`, no `node:sqlite` synchronous query inside a relay path. SQLite
  writes are small and infrequent but they are `DatabaseSync` calls, so they stay on the
  identity paths, where no transfer can be in flight on the same process *only if* the
  slot is free — and if it is not, the unlock still has to run. So: a `scrypt` unlock
  while a transfer is pumping must not stall it, which is exactly what the thread pool
  buys, and the SQLite write after it is a sub-millisecond statement.
- `UV_THREADPOOL_SIZE=8` so concurrent unlocks do not queue behind four default threads.

A test hammers the relay with a 200 MB transfer while running 20 simultaneous unlocks and
asserts throughput does not drop more than 10%.

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
  pepper leak does not expose a string the user may have reused elsewhere. PBKDF2 is what
  browsers actually expose in WebCrypto; there is no scrypt there, and shipping WASM
  scrypt to every client is not worth a once-per-device cost.
- **Why scrypt on the server.** Memory-hard, built into Node, async on the thread pool,
  no native module. N=2^15, r=8, p=3 is OWASP-aligned at roughly 32 MiB per derivation,
  which fits a 512 MB instance even with eight concurrent unlocks.
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

Client stage: ~400 ms on a laptop, in a worker, once per device. Server stage: ~150 ms on
the thread pool, once per unlock attempt — including failed ones, which is what makes the
timing uniform (§6.5).

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

Unlock (§6.5) is one opaque answer. The *send* endpoint is inherently an oracle — you must
know whether `plu_7f3k9m2x` exists before offering it a file — so it is scoped tightly:
authenticated only, 30 lookups/hour/uid, returning `{ share_id, display_name }` and
nothing else. No email, no last-seen, no account age. The residual risk (you can confirm
an id exists) is accepted and written down rather than argued away.

### 6.8 Device tokens

Retyping a 16-character key before every file would kill the product, so unlock mints a
credential once:

- On success the server generates 32 random bytes, returns them exactly once as
  `device_token`, and stores only `SHA-256(token)` with a 30-day expiry in a `devices`
  row on the share.
- The client keeps it in IndexedDB — not `localStorage`, not a cookie, never a URL — and
  presents it as the bearer credential for receiving.
- Server-side use is a hash lookup plus an expiry check, so no KDF runs on the transfer or
  queue path.
- A user can revoke one device without touching the others.

### 6.9 Rotation

`POST /drop/keys/rotate` requires the current key, then writes a new `salt_srv` and
`verifier`, bumps `rotated_at`, revokes every device token, and cancels pending offers.
Because no file bytes are at rest, rotation cannot orphan anything. Phase 2 note:
rotation also invalidates the published encryption public key (§18), which must be
re-derived and re-verified.

### 6.10 What this protects, and what it does not

Protects: the key is never stored, never transmitted, never logged; a database leak alone
does not yield it; brute force is throttled and locked out; a stolen session alone cannot
receive.

Does not protect: whoever holds both the session and the key can receive files addressed to
that id, and because delivery destroys the transfer there is nothing to recover afterwards.
The UI states this at key creation, once, without a modal.

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
| `drop-server/src/http.js` | Routing, CORS, Origin allowlist, health and status | node:http |
| `drop-server/src/auth.js` | Firebase ID token verification, ported from `api/lib/token.js` | node:crypto |
| `drop-server/src/identity.js` | Key policy, scrypt, records, lockout, device tokens, rotation | node:sqlite |
| `drop-server/src/db.js` | Schema, migrations, prepared statements | node:sqlite |
| `drop-server/src/registry.js` | Presence map, heartbeat, sweeper | ws |
| `drop-server/src/queue.js` | The slot, the FIFO, admission, positions, ETA | nothing |
| `drop-server/src/session.js` | Seats, frame pump, acks, resume, teardown | frames |
| `drop-server/src/frames.js` | Binary header encode/decode, CRC32C | nothing |
| `drop-server/src/tickets.js` | HMAC room tickets | node:crypto |
| `drop-server/src/cluster.js` | Instance list, presence home, knock forwarding, load probe | node:http |
| `src/lib/drop/identity.ts` | Key policy, NFKC, stage-one PBKDF2 in a worker, device token storage | WebCrypto |
| `src/lib/drop/sender.ts` | Read by offset, chunk, window, retransmit | identity |
| `src/lib/drop/receiver.ts` | Sink selection, ordered write, ack, resume | identity |
| `src/lib/drop/sink.ts` | `showSaveFilePicker` vs OPFS behind one interface | nothing |
| `src/apps/drop/*` | The screen: pick a person, pick a file, queue position, two bars | all of the above |

The queue knows nothing about bytes. The pump knows nothing about identity. The registry
knows nothing about either. `frames.js` alone has no imports at all.

Firebase token verification is ported rather than added as a dependency:
`node:crypto`'s `createPublicKey({ format: 'jwk' })` does what the Worker version does by
hand, and the existing logic is ~120 lines with an already-understood cache policy. That
keeps the dependency list at one.

## 8. Presence

Every signed-in client holds one WebSocket to `/drop/inbox` while the shell is open. The
socket carries presence, offers and queue updates only, never bytes.

- Registration is keyed by `share_id` in a `Map<share_id, socket>` on the registry.
- **Heartbeat is mandatory.** `ws` does not ping for you. Every 30 s the server pings and
  clears an `isAlive` flag; a client missing two consecutive pongs is terminated and
  deregistered. Without this a closed laptop lid leaves a ghost who appears online
  forever — hibernation used to hide this, nothing does now.
- A second connection for the same `share_id` replaces the first, and the first is told it
  was superseded.
- Presence is per instance, and a user's presence home is fixed by hash (§15.2), so a
  knock always knows where to look.

## 9. Offer handshake, 120-second window

1. Sender picks a file and a recipient, then `POST /drop/offers`.
2. Server authenticates, rate-limits, looks up the recipient, asks the cluster which
   instance has room (§15.2), and creates a **job** there. If every instance's queue is
   full, the request fails before anyone is knocked (§10.5).
3. The recipient's presence home forwards a knock. They see who, what, how big, their
   queue position and a rough estimate, plus a 120 s countdown. Accept or decline.
4. On accept the job becomes `queued` and holds its position. **No ticket is minted yet**
   — a ticket that had to outlive a ten-minute wait would be a long-lived credential
   sitting in an access log, which is exactly what the 60-second lifetime prevents.
5. When the job reaches the head of the queue *and* the slot is free, the server mints two
   tickets — HMAC over `{session, role, exp: now+60}`, routed to the hosting instance — and
   tells both sides to connect. A ticket is the only way into a room, so a guessed session
   id is worthless. The room fills, the pump starts.
6. If either party fails to open its room socket inside that window, the job is dropped
   and the slot passes on. This is what stops a dead pair from wedging the machine.

Two clocks, both visible, never conflated: **pickup** is the human's 120 s to consent,
**queue wait** is capacity, capped at 10 minutes (§10.4).

A recipient who is offline is told so immediately rather than being made to wait out the
countdown. Declining is a first-class outcome with its own copy, not an error.

Browsers cannot set an `Authorization` header on a WebSocket, so a ticket travels as
`?ticket=` on the upgrade URL. That puts it in access logs — acceptable because it is
single-use and lives 60 seconds, and stated here so nobody lengthens it later without
noticing.

## 10. The queue

One slot per server. Everything else waits. This is the capacity model, not a fallback for
overload, so it is designed like a feature.

### 10.1 The slot

- `slot` is either `null` or one active session. The invariant "at most one pump per
  process" is enforced by a guarded assignment that throws if it is ever violated, and
  exposed at `/internal/status` as `{ active: 0 | 1, queueDepth, measuredBytesPerSec }`.
- A slot is released on `done`, on `cancel`, on either socket dying, on the start-window
  timeout (§9.6), and on drain. Release always pulls the head of the queue, and it is one
  function so no path can forget.

### 10.2 Admission

A job is created at offer time, so the recipient knows their position while deciding.
States: `offered` → `accepted` → `active` → `done`, with `expired`, `declined`,
`cancelled` as exits.

- Only `accepted` jobs occupy a queue position. An unaccepted offer holds a reservation
  for its 120 s pickup window, counted against the depth cap so a flood of offers cannot
  outrun the queue.
- Ordering is strict FIFO by `acceptedAt`. There is no priority and no
  shortest-job-first: with one slot, either would let a big transfer starve forever, and
  a queue whose order you cannot predict is worse than a wait you can see.
- A per-uid cap of 2 queued jobs stops one person owning the line.

### 10.3 Head-of-line blocking is the design

A 4 GB transfer at the head delays everyone behind it. That is the honest consequence of
one transfer per server, and the estimate in §10.4 makes it legible. It is also the reason
§16 does not pretend this is a high-concurrency service: capacity is a number of servers,
and adding one adds exactly one transfer.

### 10.4 Position and estimate

- Position is the FIFO index plus one, counted from the front, so the running transfer
  means you are "next" rather than "first".
- Estimate is `(remaining bytes of the active job + sizes of the jobs ahead) / measured
  throughput`, where throughput is the rolling average of the active pump and falls back
  to a 2 MB/s prior before the first ack. It is shown as a range ("about 3–6 minutes"),
  because a single number on a network link is a lie.
- Recomputed on each ack batch but pushed at most once a second, to both parties' inbox
  sockets, and recomputed immediately on any queue mutation.
- Both parties see the same numbers. A countdown that disagrees between two screens is the
  fastest way to lose trust in a queue.

### 10.5 Full, cancel, duplicates

- Depth caps: 32 globally per instance, 2 per uid. Full → HTTP 503 with `Retry-After`
  and a body naming which instance to try (§15.2 can place you on a different one),
  returned *before* any knock, so nobody is bothered for a job that cannot run.
- Either party can cancel while queued: immediate, position freed, both notified, slot
  logic untouched.
- Duplicate suppression: an identical `(from, to, name, size)` offer within 30 s returns
  the existing job id rather than enqueuing a second copy. Double-clicking "send" should
  not cost someone a queue place.
- If a queued job's parties both go silent (heartbeat reaped in §8), the job is dropped and
  the queue closes up. A queue entry with nobody behind it is just a delay for everyone
  else.

### 10.6 Restart, drain, and what is deliberately not built

- The queue is in memory. A restart loses it, both clients are told
  `error{code:'restart'}`, and they can re-offer. Persisting a queue of live transfers
  would mean serving stale slots after every deploy — worse than being honest.
- On `SIGTERM` the instance stops accepting offers, tells queued jobs to re-offer
  elsewhere with their position preserved on the new instance where possible, and either
  lets the active transfer finish inside the grace window or cuts it with a clear message.
  Render allows the shutdown delay to be raised to 300 s for exactly this reason.
- Not built: fair-share scheduling, preemption, priorities, per-user reserved slots. One
  slot, one line, for everyone.

## 11. Wire protocol

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

Two control channels, deliberately separate. **Inbox** (presence socket): `offer`,
`queued{position,etaLow,etaHigh}`, `admitted{session,host}`, `expired`, `cancelled`.
**Room** (session socket): `hello{role}`, `meta{name,size,type,lastModified,chunkSize}`,
`ready`, `ack{seq,received}`, `resume{from}`, `pause`, `cancel{reason}`, `done{bytes}`,
`error{code}`. Queue state never crosses the room socket and bytes never cross the inbox.

**Backpressure is one chunk deep.** The server does not buffer. It calls
`dst.send(frame, cb)` for exactly one chunk and does not read the next frame from the
sender until that callback fires. If the receiver's disk stalls, the callback stalls, the
sender's socket fills, TCP pushes back on the sender, and `file.slice()` stops being
called. No queues, no `bufferedAmount` polling heuristic, no unbounded memory.

The 16-chunk window is therefore a *sender-side* limit bounding how much work is in flight
before an ack, not a server-side queue. Acks are batched every 8 chunks or 50 ms. An ack
means *written to the sink*, not *received by the socket* — that is what makes the second
progress bar honest.

Resume: after a reconnect, the receiver sends `resume{from: seq}`; the sender seeks with
`file.slice(seq * chunkSize)` and continues. No bookkeeping beyond a sequence number,
because the source is a file and seeking is free.

Integrity: per-chunk CRC32C plus a total byte count at `done`. There is no streaming
SHA-256 in WebCrypto, and `node:crypto` needs a per-transfer state object; the spec does
not claim what it cannot do. Whole-file hashing, if wanted later, is a separate decision.

Ordering: the receiver writes strictly in sequence order, holding out-of-order arrivals in
a reorder buffer bounded by the window.

## 12. Sender pump

Read from the `File` by offset in 256 KiB slices, keep at most 16 unacked, retransmit a
chunk whose ack never arrives, never read the file into memory. The source may be
arbitrarily large; the sender's footprint stays at the window size.

Because the server is single-slot, `ready` may arrive after a wait. The sender therefore
holds only the file handle while queued — never a stream, never buffered chunks — so a
queued job costs a few hundred bytes and a socket.

The sender's tab must stay open for the duration, including the wait. The UI says so
before the transfer starts rather than after it fails.

A client that has several files selected may send them one at a time: each becomes its own
job that re-enters the queue when the previous finishes. That is one line of client
behaviour and no protocol change, which is why it stays out of §3's non-goals only in the
sense that it is not a single session carrying multiple files.

## 13. Receiver sink

One interface: `open(meta) → { write(seq, bytes), close(), abort() }`.

- **The destination is chosen when the job is admitted, not when it is offered.** Asking
  for a save location and then making someone stare at a file picker for eight minutes is
  worse than asking at the moment the bytes start.
- Chromium: `showSaveFilePicker()` then stream through `createWritable()`.
- Firefox 111+ and Safari 15.2+: OPFS with `createSyncAccessHandle()` in a dedicated
  worker, then hand the finished file out as a download and delete the temp on success.
  Still disk-backed, so the memory ceiling mostly dissolves. Verified Baseline since March
  2023, worker-only, secure context.
- Both pumps run in Web Workers so the shell stays responsive; `File` is
  structured-cloneable into a worker and `slice()` works there.
- No cross-origin isolation needed. `vite.config.js` sends `COOP`/`COEP` as `unsafe-none`
  and nothing here wants `SharedArrayBuffer`.
- If neither sink exists, refuse to receive above 512 MB rather than pretend.

## 14. Failure modes

| Failure | Behaviour |
| --- | --- |
| Recipient offline | Immediate "not online right now"; no job created |
| Offer not accepted in 120 s | Expires with a countdown; sender sees "no pickup" |
| Recipient declines | Explicit, with copy saying nothing was sent |
| Queue full at offer time | 503 with `Retry-After` and another instance if one has room |
| Queue wait exceeds 10 min | Job expires; both told "no slot freed up", nothing sent |
| Queued party disconnects | Job dropped, queue closes up, other party told |
| Sender closes tab | Receiver keeps what it has, is told the transfer stopped |
| Receiver closes tab | Sender is told; slot released to the next job |
| Network blip mid-transfer | Reconnect with a fresh ticket, `resume{from: seq}`, continue |
| Disk write fails | Session aborts with the reason; partial file left where chosen |
| Server redeployed (SIGTERM) | Drain: no new offers; queued jobs told to re-offer, position not carried across instances; active transfer finishes or is cut with a clear message |
| Instance restarts / OOM | Queue and sessions are lost; clients see a drop, are told why, and can re-offer |
| Ghost presence | Reaped by the heartbeat in 60 s |

Partial files are never deleted without telling the user. A half-received 4 GB file is
still their file.

## 15. Deployment

### 15.1 Render

- Web Service, Docker or Node runtime, `npm start`, health check `/healthz`. All traffic on
  one port; WebSockets ride the same port as HTTP.
- **Starter or above, with a persistent disk at `/data`, `DROP_DB=/data/drop.db`.** Free
  instances spin down after 15 minutes, take about a minute to wake, and have an ephemeral
  filesystem — losing every user's key record on a deploy is not acceptable.
- Env: `DROP_KEY_PEPPER`, `DROP_TICKET_SECRET`, `DROP_CLUSTER_SECRET`,
  `DROP_PUBLIC_URL`, `DROP_CLUSTER`, `DROP_ORIGINS`, `FIREBASE_PROJECT_ID`, `DROP_DB`,
  `PORT`.
- `SIGTERM` sets a draining flag immediately and refuses new offers from that moment.

### 15.2 Several servers, and how anything finds anything

More servers means more slots, one each. Two different routing problems, two different
answers.

**Presence is pinned by hash.** Each user's inbox lives on
`cluster[hash(share_id) % cluster.length]`, a pure function of a shared config list with no
coordinator. A knock for a recipient is forwarded with `POST /internal/knock`, HMAC-signed
with `DROP_CLUSTER_SECRET` and given a 5 s timeout; an unreachable home is reported as "not
online right now" rather than guessed at.

**Sessions are placed by load.** At offer time the entry instance fans out
`GET /internal/status` to the cluster with a 500 ms budget each, and picks the instance
with the shortest queue. That instance's `DROP_PUBLIC_URL` goes into the offer response,
and both clients open their room socket *there*, not on whatever host the load balancer
picks. This is why every instance must know its own public URL.

Consequences worth stating plainly:

- A session never spans machines, so a transfer cannot be split across two instances.
- Changing `DROP_CLUSTER` rehashes some users' presence homes; they reconnect once.
- A load balancer in front is fine for HTTP, but it must not be trusted to route
  WebSockets by round-robin — the room URL in the offer is absolute for exactly that
  reason.
- Capacity is `number of instances`. The `/internal/status` fan-out is how the entry
  instance knows a slot exists before bothering a recipient.

### 15.3 Security

- **Origin allowlist on upgrade.** Cross-site WebSocket hijacking is real: browsers send
  cookies and any page can open a socket to your endpoint. `Origin` is checked against
  `DROP_ORIGINS` on every upgrade, presence and room alike, and a mismatch is refused
  before the handshake completes.
- CORS stays header-based (`Authorization: Bearer`), so `Access-Control-Allow-Origin`
  names the shell origin explicitly rather than `*`.
- `/internal/*` requires the cluster HMAC and is never exposed through the public
  load balancer; it is reachable only instance-to-instance.
- `X-Forwarded-For` is trusted only behind the platform proxy.

## 16. Limits and cost

- 30 offers/hour/uid; 2 queued jobs per uid; 32 queued globally per instance. The per-uid
  queued cap is what bounds one user's footprint across a cluster, since a slot itself is
  per instance and one person could otherwise occupy a place on every machine.
- No hard size cap. A warning and a visible time estimate above 2 GB.
- **Bandwidth is the dominant cost, and it is doubled.** Every byte crosses the server
  twice: once inbound, once outbound. A 2 GB file is 2 GB in and 2 GB out, so a free
  instance's 5 GB/month is roughly 2.5 GB of actual transfers. This is a sharper constraint
  than the Durable Object duration billing it replaced, and it is the main argument for
  revisiting WebRTC later.
- Memory is flat by design (§11): two sockets, one 256 KiB frame buffer per session, and a
  queued job is a few hundred bytes because nothing is buffered until the slot opens.

## 17. Testing

- `node:test` throughout; no new test framework.
- Key policy table tests: accept/reject, NFKC equivalence, code points vs bytes.
- Derivation vectors pinned for both stages, plus a test that an older record still
  verifies at its stored work factor.
- Lockout arithmetic: the doubling schedule, the cap, the reset on success.
- Concurrency: 20 parallel failed unlocks against one share must not exceed the threshold,
  proving the transaction is atomic.
- Constant-time compare, and unknown-share responses identical to wrong-key responses.
- **Queue, as pure functions first:** FIFO order under interleaved arrival; the slot
  invariant under concurrent release attempts; cancel frees a position; duplicate
  suppression within 30 s; depth caps returning 503 before any knock; a job whose parties
  both vanish being dropped; and position and ETA monotonic as the active transfer
  progresses.
- **Queue, over real sockets:** two accepted jobs, one slot, asserting the second never
  starts before the first finishes, and both clients see the same position at every step.
- Frame round-trip, CRC mismatch, malformed and oversized length rejection.
- Two-client integration test with a forced drop at chunk 100 and a resume proving the
  bytes match.
- The no-blocking test from §5.3: throughput must not drop >10% while 20 unlocks run.
- Cluster test with three instances in one process tree: presence routing by hash, knock
  forwarding, and offer placement landing on the least-loaded instance.
- A 1 GB soak asserting flat RSS while a second job waits in the queue.

## 18. Phase 2: end-to-end encryption

Designed for now, built later.

- Each share publishes an X25519 public key derived per §6.11; the private half never
  leaves the device and is unlocked by the key.
- Sender derives a shared secret, then an AEAD key per chunk from a counter, sending
  ciphertext. The relay moves opaque bytes.
- **A fingerprint is mandatory, not optional.** Both sides display four words derived from
  the public key, verified once out of band. Without that check a malicious relay
  substitutes its own key and the encryption is decoration. The fingerprint exchange is the
  feature; the cipher is the easy part.
- Because nothing is at rest, rotation breaks only in-flight and pending exchanges.

## 19. Risks

1. A usermade key is a password and people reuse passwords. The two-stage derivation means
   a leak costs this service and not others, but it does not make a weak key strong.
2. The send endpoint confirms whether an id exists. Rate-limited, authenticated,
   documented; not eliminated.
3. Both tabs must stay open, now including the queue wait. Inherent, and it is the same
   property that makes the product trustworthy.
4. One transfer per server means one bad job delays everyone behind it. That is the
   deliberate tradeoff; the estimate is what keeps it honest.
5. A restart loses the queue and every live session. A redeploy is a restart.
6. Bandwidth doubling means the service costs money in proportion to what people send,
   which store-then-download would not.
7. `node:sqlite` is a release candidate and its API is still moving — `DatabaseSync` was
   renamed in Node 26.11. Pin the Node major in `.nvmrc` and CI.
8. Presence pinned by hash means a config change reconnects some users. Cheap, but not
   free.

## 20. Build order

1. `frames.js` + pure window/ack logic, with tests. No networking.
2. `queue.js` with the slot invariant, FIFO, positions, ETA and caps — pure, with tests,
   before any socket exists.
3. `db.js` and `identity.js`: schema, policy, two-stage derivation, lockout, device tokens,
   rotation.
4. `session.js` pump over a local Node process, two headless clients, one file.
5. `registry.js` presence and heartbeat, then the 120 s offer handshake and knocks.
6. `cluster.js`: hash-pinned presence, knock forwarding, load probe, offer placement.
7. Sender and receiver pumps, Chromium sink, then the OPFS fallback.
8. The screen: pick a person, pick a file, queue position, two progress bars.
9. `http.js` hardening: Origin allowlist, CORS, `/internal/*` isolation, drain on SIGTERM,
   `/healthz`.
10. 1 GB soak with a queued second job, then the phase-2 envelope.
