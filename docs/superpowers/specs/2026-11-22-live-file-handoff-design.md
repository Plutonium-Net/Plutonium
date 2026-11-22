# Plutonium Drop — live file handoff

Date: 2026-11-22
Status: design approved, spec awaiting review

## 1. Summary

A file transfer that only exists while both people are present. One client picks a
file, names a recipient's `share_id`, and the bytes stream through a Durable Object
to the other client's socket. No file bytes are stored anywhere; the receiver writes to
disk as the bytes arrive, starting at byte zero.

**The pitch, in one line:** a phone call for files, not an inbox.

Consequences, all of which are features rather than side effects:

- The receiver is done when the sender is done. No upload wait, no second download.
- No storage bill, no expiry policy, no retention job, no cleanup cron.
- Nothing to leak afterwards, because nothing was ever kept.
- If either side closes the tab, the transfer is gone. That is the tradeoff, and the
  UI says so out loud instead of hiding it.

## 2. What makes it unlike the usual file transfer

1. **Live-only.** Every other service is store-then-download. This one refuses to store.
2. **Addressed to a person, not a link.** You send to `plu_7f3k9m2x`, not to a URL with
   a secret in it. The URL is an address you can post anywhere.
3. **Two progress bars.** *Sent* (handed to the socket) and *confirmed* (the receiver
   wrote it). Most tools show only the first, which is why they feel dishonest.
4. **Resume is nearly free.** The sender reads from the file by offset, so reconnecting
   resumes at a sequence number rather than a byte count it has to guess.
5. **Phase 2: the relay can't read it.** Designed for, not built yet (§16).

## 3. Non-goals for v1

Multiple files per session, folders, fan-out to several receivers, offline/queued
delivery, permanent links, a native or CLI client, WebRTC, any storage of file bytes —
no R2, no KV blobs — server-side previews or thumbnails, resumable-forever downloads.
Metadata that is stored (an offer's 120 s TTL record, a key verifier) is listed where it
lives, and it never includes file content.

## 4. Locked decisions

| Decision | Value |
| --- | --- |
| Transport | Relay through one Durable Object per session |
| Direct P2P | Deferred; the transport sits behind an interface |
| Identity | Firebase session (`api/lib/player.js`) + usermade `share_key` |
| `share_id` | Server-generated, immutable, public, resolvable only by exact id |
| Pickup window | 120 seconds, with a visible countdown on both ends |
| E2E encryption | Phase 2; the envelope is designed to accept it |
| Chunk size | 256 KiB |
| In-flight window | 16 chunks (4 MiB) |
| Ack cadence | every 8 chunks or 50 ms, whichever comes first |

## 5. Identity: hardening the usermade key

A usermade key is a password. It is the weakest part of the design, so it gets the
most constraint. This section is normative.

### 5.1 Credential model

- `share_id` — generated at first use, 8 characters from the games alphabet
  (`A-HJ-NP-Z2-9`, reusing `api/routes/rooms.js`), prefixed `plu_`. Public. Immutable.
  It is an address, not a credential: `plutoniumnet.work/drop/plu_7f3k9m2x` can be
  posted publicly because opening it requires a session *as* that person.
- `share_key` — usermade, never stored, never logged, never in a URL, never in a
  query string. Unlocked once per device, then replaced by a device token (§5.9).

Two factors in practice: the Firebase session proves the account, the key proves it is
really you on this device. Neither alone is enough to receive.

### 5.2 Key policy

Enforced on the client for immediate feedback and re-enforced on the server, because
client validation is a UI convenience and not a control.

- Length 16–128 characters, counted as Unicode code points after normalization.
- Rejected: equal to or containing the `share_id`; a single repeated character; a
  monotonic run (`abcdef…`, `123456…`); any of the 1000 most common passwords
  (bundled list, client-side for UX, server-side for enforcement).
- No forced composition classes. They measurably produce worse keys.
- Any Unicode is allowed, normalized to NFKC before use so `é` composed and decomposed
  are the same key. Encode UTF-8 after normalizing. Never normalize twice on different
  sides.
- A strength hint is shown while typing. It is advice; the floor is the rules above.
- Creation asks for the key twice, stores no copy, and shows the key-reuse warning
  (§5.11) at that moment, once, in plain words.

### 5.3 The PBKDF2 ceiling, and the two-machine split

`crypto.subtle` in Workers **rejects PBKDF2 iteration counts above 100,000** with
`NotSupportedError`. This is a runtime policy in workerd, not a spec limit, and
critically it is **not** enforced by `wrangler dev` or Node — so a 600,000-iteration
design passes every local test and fails on the first production signup. OWASP
recommends 600,000 for PBKDF2-HMAC-SHA256. The two numbers do not fit.

The answer is to stop asking one machine to do all of it:

```
client:  K = PBKDF2-SHA256(NFKC(key), salt = "plu-drop:v1:" + share_id,
                           iterations = 600_000, 32 bytes)      # browser, no cap
server:  D = PBKDF2-SHA256(K, salt = salt_srv, iterations = 100_000, 32 bytes)
         V = HMAC-SHA256(pepper, D)                             # pepper = env secret
         store  "v1$pbkdf2s256$600000$100000" plus salt_srv and V   (§5.5)
```

Properties this buys:

- The server never receives the actual key. A database *and* pepper leak therefore does
  not expose a key the user may have reused elsewhere — only that one service's digest.
- Each online guess costs the attacker a 600,000-iteration browser-grade derivation plus
  a network round trip, then hits the lockout in §5.7.
- An offline attacker holding the database must invert a 100,000-iteration stage to
  recover the digest, which is then pass-the-hash *for this service only*. That is the
  honest limit of a two-stage scheme, and it is why the pepper and the lockout matter
  more than the iteration count.

`ITERATIONS_SERVER` is pinned at 100,000 and asserted in a test that fails loudly with
"workerd PBKDF2 cap" rather than letting a future contributor raise it and discover the
ceiling in production. If the cap is raised upstream, the count lives in the stored
record, so old verifiers keep working and rehash-on-login upgrades them (§5.5).

The pepper is a Worker secret (`DROP_KEY_PEPPER`), never in a binding file, never in the
repo. Losing it invalidates every key; that is stated in the runbook, not discovered.

### 5.4 Normalization and encoding

`NFKC` → `TextEncoder` (UTF-8) → the derivation above. Salt input for stage one is the
literal ASCII `plu-drop:v1:` followed by the `share_id`, so a key and a digest are bound
to one identity: the same typed key produces different digests for different accounts,
and moving a digest between accounts does nothing.

### 5.5 Stored record

One record per share, in the existing Firestore user document via the gateway:

```json
{
  "share_id": "plu_7f3k9m2x",
  "key": {
    "v": "v1$pbkdf2s256$600000$100000",
    "salt_srv": "<b64url, 16 bytes>",
    "verifier": "<b64url, 32 bytes>",
    "created_at": 1763856000,
    "rotated_at": null
  },
  "fail": { "count": 0, "window_start": 1763856000, "locked_until": null }
}
```

The version string carries both work factors so verification can run an older record at
its own cost and then transparently rehash to current parameters on success (the standard
Django-style upgrade path). No plaintext key, no key-derived material beyond `verifier`,
and `salt_srv` is unique per share.

### 5.6 Verification

Compare with a constant-time comparison over equal-length buffers — never `===` on the
derived bytes, never early-return on length mismatch before the compare is padded.

If the `share_id` does not exist, run the same two derivations against a fixed dummy salt
and a fixed dummy verifier, then fail. Unknown-account and wrong-key responses must be
indistinguishable in text, status code and timing: one error, `That key didn't work.`,
HTTP 401, `Cache-Control: no-store`.

### 5.7 Lockout and rate limits

The threat is online guessing against a human-chosen string, so the counter is the real
control:

- Per share: 5 failed unlocks in 15 minutes → locked 15 minutes. Each further failure
  doubles the lock (15 m, 30 m, 1 h, 2 h, 4 h), capped at 24 hours. A successful unlock
  clears the counter.
- Per IP (`CF-Connecting-IP`): 20 failed unlocks in 10 minutes across all shares, to stop
  spraying many accounts from one host.
- Counters live in the per-share Durable Object so increment-and-check is atomic; two
  parallel guesses cannot both read `count: 0`. KV via `api/lib/ratelimit.js` is used for
  the coarse per-uid and per-IP buckets only, because KV reads are not linearizable.
- Lockout responses are generic and include `Retry-After`. A lockout never reveals
  whether the key was close.

### 5.8 Enumeration

Unlock (§5.6) is a single opaque answer. The *send* endpoint is inherently an oracle —
you must know whether `plu_7f3k9m2x` exists before you can offer it a file — so it is
scoped as tightly as possible: authenticated only, 30 lookups/hour/uid, and it returns
`{ share_id, display_name }` and nothing else. No email, no last-seen, no account age.
The residual risk (you can confirm an id exists) is accepted and written down rather than
argued away.

### 5.9 Device tokens

Typing a 16-character key before every file would kill the product, so unlock mints a
credential once:

- On success the server generates 32 random bytes, returns them exactly once as
  `device_token`, and stores only `SHA-256(token)` with a 30-day expiry in a device list
  on the share.
- The client keeps it in IndexedDB (not `localStorage`, not a cookie, never a URL) and
  presents it as the bearer credential for receiving.
- Server-side use is a hash lookup plus an expiry check — no KDF per request, which keeps
  the 100,000-iteration cost confined to the unlock path.
- Rotation revokes every device token (§5.10). A user can revoke one device without
  touching the others.

### 5.10 Rotation

`POST /drop/keys/rotate` requires the current key, then writes a new `salt_srv` and
`verifier`, bumps `rotated_at`, revokes all device tokens, and cancels pending offers.
Because nothing is at rest, rotation cannot orphan a file. Phase 2 note: rotation also
invalidates the published encryption public key (§16), so it must be re-derived and
re-verified at that point.

### 5.11 What this protects, and what it does not

Protects: the key is never stored, never transmitted, and never logged; a database leak
alone does not yield it; brute force is throttled and locked out; a stolen session alone
cannot receive.

Does not protect: whoever holds both the session and the key can receive files addressed
to that id, and because delivery destroys the transfer there is nothing to recover
afterwards. The UI states this at key creation in plain words, once, without a modal.

### 5.12 Phase-2 separation

When encryption arrives, the encryption identity is derived from the *same* key with
HKDF and a distinct `info` string:

```
enc_priv = HKDF-SHA256(ikm = K, salt = share_id, info = "plu-drop/enc/v1", 32 bytes)
```

so the authentication verifier and the encryption key never coincide. Rotating the key
rotates both; the two purposes stay separated by domain string, never by convention.

## 6. Components

Each unit has one job and can be understood, and tested, without the others.

| Unit | Job | Depends on |
| --- | --- | --- |
| `api/routes/drop.js` | Auth, rate limit, share lookup, offer creation, ticket minting | player, ratelimit, responses |
| `api/drop-share.js` (DO) | Key record, unlock, lockout counter, device tokens | nothing (self-contained) |
| `api/drop-inbox.js` (DO) | One hibernating socket per online share; presence and knocks | nothing |
| `api/drop-room.js` (DO) | Seat table, frame pump, acks, resume, teardown | frames |
| `api/lib/frames.js` | Binary header encode/decode, CRC32C | nothing |
| `src/lib/drop/identity.ts` | Key policy, NFKC, stage-one derivation, device token storage | WebCrypto |
| `src/lib/drop/sender.ts` | Read by offset, chunk, window, retransmit | identity |
| `src/lib/drop/receiver.ts` | Sink selection, ordered write, ack, resume | identity |
| `src/lib/drop/sink.ts` | `showSaveFilePicker` vs OPFS fallback behind one interface | nothing |
| `src/apps/drop/*` | The screen: pick a person, pick a file, two bars | all of the above |

The pump (`drop-room.js`) knows nothing about identity. The inbox knows nothing about
bytes. The sink knows nothing about the wire. That is what makes each piece testable in
a few lines.

## 7. Requirements and browser support

- Both ends: the Plutonium shell, signed in.
- Receiving: Chromium uses `showSaveFilePicker()` + `createWritable()` — a true
  user-visible path, streamed, ~64 MB of RAM for an 8 GB file. Firefox 111+ and
  Safari 15.2+ use OPFS with `createSyncAccessHandle()` in a dedicated worker, then hand
  the completed file out as a download; still disk-backed, so the memory ceiling mostly
  dissolves. Verified support: `createSyncAccessHandle` is Baseline widely available
  since March 2023, worker-only, secure context only.
- Both pumps run in Web Workers so the shell stays responsive; `File` objects are
  structured-cloneable into a worker, and `File.stream()` / `slice()` work there.
- If neither sink is available, refuse to receive above 512 MB rather than pretend.
- No cross-origin isolation requirement, which matters: `vite.config.js` currently sends
  `COOP`/`COEP` as `unsafe-none`, and nothing here needs `SharedArrayBuffer`.

## 8. Addressing and presence

Every signed-in client holds one hibernating socket to `drop-inbox` for its own
`share_id` while the shell is open. That socket carries presence and offers, nothing
else, and it hibernates when idle — which is what keeps idle presence effectively free.

A `share_id` is resolvable only by exact id. There is no directory and no search, so
public ids cannot be harvested by browsing.

## 9. Offer handshake, 120-second window

1. Sender picks a file and a recipient, then `POST /drop/offers`.
2. Server authenticates, rate-limits, looks up the recipient, mints `session:<random>`,
   stores an offer record in KV with a 120 s TTL, and knocks on the recipient's inbox.
   The response carries the sender's room ticket, so the sender connects and waits at
   once — the room is occupied before the recipient has even seen the offer.
3. Recipient sees who, what, how big, and a countdown that matches the sender's. Accept
   or decline.
4. On accept, the server mints two short-lived tickets — HMAC over
   `{session, role, exp: now+60}` — one to the room URL for each side. A ticket is the
   only way into a room, so a guessed room id is worthless.
5. The sender is already seated from step 2, so the room is full and the pump starts.
6. At 120 s with no accept: the offer expires, the room tears down, the sender is told
   nobody picked up. Nothing was kept.

Declining is a first-class outcome with its own copy, not an error. A recipient who is
offline is told so immediately rather than being made to wait out the countdown.

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

Payload follows immediately, up to 256 KiB. Frame size stays orders of magnitude under
the 32 MiB WebSocket message limit, leaving headroom if the chunk size is ever raised.

Control messages: `hello{role}`, `meta{name,size,type,lastModified,chunkSize}`,
`ready`, `ack{seq,received}`, `resume{from}`, `pause`, `cancel{reason}`,
`done{bytes}`, `error{code}`.

Flow control: a 16-chunk sliding window (4 MiB in flight). The sender stops at the
window edge until an ack advances it, so a slow disk on the receiving end pushes back on
the sending end instead of filling memory. Acks are batched every 8 chunks or 50 ms, per
Cloudflare's own WebSocket batching guidance. An ack means *written to the sink*, not
*received by the socket* — that is what makes the second progress bar honest.

Resume: after a reconnect, the receiver sends `resume{from: seq}`; the sender seeks with
`file.slice(seq * chunkSize)` and continues. No bookkeeping beyond the sequence number,
because the source is a file and seeking is free.

Integrity: per-chunk CRC32C plus a total byte count at `done`. There is no streaming
SHA-256 in WebCrypto — `crypto.subtle.digest` wants the whole buffer — so the spec does
not claim one. If whole-file hashing is wanted later it needs an incremental
implementation, and that is a separate decision.

Ordering: the receiver writes strictly in sequence order. Out-of-order arrivals are held
in a small reorder buffer bounded by the window; the window cannot be exceeded, so the
buffer cannot grow.

## 11. Sender pump

Read from the `File` by offset in 256 KiB slices, send while inside the window, retransmit
a chunk whose ack never arrives within a timeout, and never read the whole file into
memory. The source file may be huge; the sender's footprint stays at the window size.

The sender's tab must stay open for the duration. That is inherent to the design and is
stated in the UI before the transfer starts, not after it fails.

## 12. Receiver sink

One interface: `open(meta) → { write(seq, bytes), close(), abort() }`.

- Chromium: ask for a destination with `showSaveFilePicker()` *before* the transfer
  starts, so the user picks the location up front and a long transfer is never lost to a
  late permission prompt. Stream through `createWritable()`.
- Firefox/Safari: create an OPFS temp file, write through a synchronous access handle in
  a worker, then surface the finished file as a download and delete the temp on success.
- Either way, flush periodically, and treat a write failure as fatal for the session
  rather than silently dropping bytes.

## 13. Failure modes

| Failure | Behaviour |
| --- | --- |
| Recipient offline | Immediate "not online right now"; no offer is stored |
| Offer not accepted in 120 s | Expires with a countdown; sender sees "no pickup" |
| Recipient declines | Explicit, with copy that says nothing was sent |
| Sender closes tab | Receiver keeps what it has, is told the transfer stopped, and can keep the partial file |
| Receiver closes tab | Sender is told; nothing to resume unless they reopen within the session |
| Network blip | Reconnect with a ticket, `resume{from: seq}`, continue |
| Disk write fails | Session aborts with the reason surfaced; the partial file is left where the user chose |
| Room DO evicted | Acceptable: the session is over. Sockets hibernate, but an active pump keeps the object alive |

Partial files are never deleted without telling the user. A half-received 4 GB file is
still their file.

## 14. Limits and cost

- 30 offers/hour/uid; 3 concurrent sessions/uid; reusing `checkRateLimit`.
- No hard size cap. A warning and a visible transfer estimate above 2 GB.
- Duration is billed while the object is awake, at its memory size: a 27-minute transfer
  through a 128 MB object is roughly 207 GB-s, so about 1,900 such transfers fit in the
  paid month's included duration and about 60/day on the free plan. Chatty sockets and
  idle presence are cheap because hibernation suspends duration billing.
- Incoming WebSocket messages are billed at a 20:1 ratio and outgoing ones are not
  billed; at 256 KiB chunks a gigabyte is ~4,096 messages, so message billing is not the
  constraint. Duration is.

## 15. Testing

- Key policy table tests (accept/reject, NFKC equivalence, byte-length vs code points).
- Derivation vectors pinned from both stages, including a test that **asserts the
  workerd cap** so a future iteration increase fails in CI rather than in production.
- Lockout arithmetic including the doubling schedule and the reset on success.
- Constant-time compare and the unknown-share path producing identical responses.
- Frame encode/decode round-trip, CRC mismatch rejection, malformed length rejection.
- Window and ack logic as pure functions — no sockets needed.
- A two-client integration test in `wrangler dev` with a real file, a forced drop at
  chunk 100, and a resume proving the bytes match.
- A 1 GB soak asserting the receiver's memory stays flat.

## 16. Phase 2: end-to-end encryption

Designed for now, built later.

- Each share publishes an X25519 public key derived per §5.12; the private half never
  leaves the device and is unlocked by the key.
- Sender derives a shared secret, then an AEAD key per chunk from a counter, and sends
  ciphertext. The relay moves opaque bytes; it could not read a file if it wanted to.
- **A fingerprint is mandatory, not optional.** Both sides display four words derived
  from the public key, verified once out of band. Without that check a malicious relay
  substitutes its own key and the encryption is decoration. The fingerprint exchange is
  the feature; the cipher is the easy part.
- Because nothing is at rest, a key rotation breaks only in-flight and pending exchanges.
  That is a much smaller problem than it would be for a storage service.

## 17. Risks

1. A usermade key is a password, and users reuse passwords. The two-stage derivation and
   the client-side stage mean a leak costs this service and not others, but it does not
   make a weak key strong.
2. The send endpoint confirms whether an id exists. Rate-limited, authenticated, and
   documented; not eliminated.
3. Both tabs must stay open for the whole transfer. Inherent, and it is the same property
   that makes the product trustworthy.
4. Reconnect and resume depend on tickets surviving a blip; a long outage ends the
   session. Acceptable for a live transfer, and it matches the promise.

## 18. Build order

1. `frames.js` + pure window/ack logic, with tests. No networking.
2. Share identity: policy, two-stage derivation, record, lockout, device tokens, and the
   cap-asserting test.
3. `drop-room.js` pump over a local `wrangler dev`, two headless clients, one file.
4. `drop-inbox.js` presence and the 120 s offer handshake with countdown.
5. Sender and receiver pumps, Chromium sink, then the OPFS fallback.
6. The screen, the two progress bars, and the honest copy.
7. Soak test at 1 GB, then the phase-2 envelope.
