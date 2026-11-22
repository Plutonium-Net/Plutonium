# Plutonium Drop — live file handoff

Date: 2026-11-22
Status: design approved, spec revised for id + password sessions

## 1. Summary

A file transfer that only exists while both people are present. One side uploads: pick a
server, get an id, choose a password. The other side downloads: enter the server, the id
and the password, and once both ends confirm, the bytes stream through the server to the
receiver's disk.

**The pitch, in one line:** a phone call for files, not an inbox.

Consequences, all features rather than side effects:

- The receiver is done when the sender is done. No upload wait, no second download.
- No storage bill, no expiry policy, no retention job, no cleanup cron.
- Nothing to leak afterwards, because no file was ever kept.
- If either side closes the tab, the transfer is gone. The UI says so out loud.
- **Every server runs exactly one transfer at a time.** A transfer gets the whole machine,
  and the wait is numbered and visible instead of silently degrading everyone's throughput.
- **No standing credentials.** There is no account-level key, no device token, no address
  you can be messaged at. A session's password dies with the session.

This service is a **separate Node process**, not a Cloudflare Worker, and shares no runtime
with `api/`.

## 2. What makes it unlike the usual file transfer

1. **Live-only.** Every other service is store-then-download. This one refuses to store.
2. **Three fields, no link.** Server, id, password. Nothing in a URL, nothing to expire,
   nothing to paste into a browser bar that a chat client will unfurl.
3. **The password gets you to the door; the sender opens it.** A correct password is not
   enough to receive a file — the uploader confirms the join, and the downloader confirms
   the destination. Both ends say yes or nothing moves.
4. **One transfer per server, with a real queue.** You pick the server, so you can pick a
   short line.
5. **Two progress bars.** *Sent* (handed to the socket) and *confirmed* (the receiver
   wrote it). Most tools show only the first, which is why they feel dishonest.
6. **Resume is nearly free.** The sender reads from the file by offset, so reconnecting
   resumes at a sequence number rather than a byte count it has to guess.
7. **Phase 2: the relay can't read it** — and this model makes that easier, not harder
   (§17).

## 3. Non-goals for v1

Accounts for receivers, contacts or address books, sending to someone who is offline,
multiple files inside one session (the client may queue files across sessions), folders,
fan-out to several receivers, permanent links, a native or CLI client, WebRTC, any storage
of file bytes — no S3, no disk spool — server-side previews, resumable-forever downloads,
sessions that survive a restart, a queue that survives a restart.

## 4. Locked decisions

| Decision | Value |
| --- | --- |
| Runtime | Standalone Node 24 LTS process, plain `node:http` + `ws` |
| Hosting | Render.com Web Services (Docker-compatible anywhere), N independent instances |
| Addressing | Server + 6-character id + session password |
| Concurrency | Exactly one active transfer per server; the rest wait in a FIFO queue |
| Consent | Mutual: uploader confirms the join, downloader confirms the destination |
| Transport | Relay: sender socket → server → receiver socket |
| Identity | Firebase session for uploading only; receivers need no account |
| Key derivation | PBKDF2-SHA256 600k in the browser over the id, scrypt N=2^15 r=8 p=3 on the server |
| Password attempts | 5, then the session is destroyed |
| Session lifetime | 30 min idle, 60 min absolute |
| Queue wait cap | 10 minutes, then the job expires and both sides are told |
| E2E encryption | Phase 2, via PAKE; the envelope is designed to accept it |
| Chunk size | 256 KiB |
| In-flight window | 16 chunks (4 MiB), gated by real socket backpressure |
| Ack cadence | every 8 chunks or 50 ms, whichever comes first |
| Persistence | None. No database, no disk. |
| npm dependencies | one: `ws` |

## 5. Runtime: a real process instead of a Worker

### 5.1 What moving off Workers buys

- **The PBKDF2 ceiling disappears.** Workers reject iteration counts above 100,000 and
  `wrangler dev` does not reproduce it. Node has no such cap (§6.3).
- **No message-size ceiling.** 32 MiB per WebSocket message was never a problem at
  256 KiB, but it is no longer a design input.
- **No duration billing.** A 27-minute transfer cost roughly 207 GB-s on a Durable Object.
  Here it costs bandwidth and a slice of one vCPU, which is the honest cost.
- **Real backpressure.** A Durable Object forwarding to a second hop cannot see the
  receiver's socket buffer. A Node process owns both sockets and can gate on the
  destination's send callback (§10).

### 5.2 What it costs

- **One event loop is a shared resource.** Any synchronous work during a transfer stalls
  it. The one-transfer rule turns out to help: with a single pump alive, the relay has the
  whole loop.
- **One transfer per process.** Capacity is a count of servers, so the client picks one.
- **Node's WebSocket server is not built in.** `ws` is the one added dependency.
- **No edge.** Every byte crosses the region the service runs in twice: once inbound, once
  outbound. On a metered plan that doubling is the dominant cost (§15).

### 5.3 The no-blocking rule

Nothing CPU-bearing runs on the main thread while a transfer is live.

- Password KDFs use `crypto.scrypt` **async** (libuv thread pool), never `scryptSync`.
- The client's PBKDF2 runs in a Web Worker, so a 600k derivation does not freeze the shell.
- No synchronous `fs`, no synchronous hashing of anything large, no `JSON.stringify` of
  large structures.
- `UV_THREADPOOL_SIZE=8` so concurrent verifications do not queue behind four default
  threads.

A test hammers the relay with a 200 MB transfer while running 20 simultaneous password
verifications and asserts throughput does not drop more than 10%.

## 6. The session password

There is no standing credential to harden anymore, which removes most of the old key
machinery — and moves the whole problem into a five-minute window, where it is easier to
reason about.

### 6.1 Two roles, one secret

- **Uploader** — signed in with the existing Plutonium account. Creates the session, picks
  the file, chooses the password, and is the only party who can confirm a join. Sign-in
  gives rate limiting a real uid and attributes abuse to an account.
- **Downloader** — no account. Knows three things: server, id, password. That is the whole
  credential, and it expires when the session does.

The uploader's socket *is* the session (§6.7): if their tab closes, the id stops existing.

### 6.2 The id

- 6 characters from the alphabet in `api/routes/rooms.js` (`A-HJ-NP-Z2-9`), issued by the
  server at creation: 30 bits. Shown grouped, `K7M-2QX`.
- Unique per server while live. This is what makes the id usable as a salt (§6.3) and
  cheap to type.
- 30 bits is deliberately *not* the security boundary. The password is, and guesses are
  limited to 5 per session (§6.6).

### 6.3 Derivation

The password never leaves the browser, and nothing is ever written to disk:

```
client:  K = PBKDF2-SHA256(NFKC(password), salt = "plu-drop/session/v1:" + id,
                           iterations = 600_000, 32 bytes)
server:  V = scrypt(K, salt = id_bytes, N = 2^15, r = 8, p = 3, maxmem = 64 MiB, 32 B)
         store V in the live session record, in memory, and nothing else
```

- **Why two stages.** The server never receives the password, so a memory compromise or a
  verbose log exposes a digest rather than a string people reuse elsewhere. It also leaves
  the door open for phase 2 (§17).
- **Why the id is the salt.** It is unique per live session and already known to both
  sides, so no extra round trip and no salt-lookup endpoint. Salts need uniqueness, not
  entropy — the password supplies the guessing cost.
- **Why scrypt on the server.** Memory-hard, built into Node, async on the thread pool, no
  native module, ~150 ms and 32 MiB per attempt.
- **No pepper.** The old design peppered a verifier to survive a database leak. There is no
  database. Adding a pepper to a value that lives for five minutes in RAM would be
  ceremony, and the spec says so rather than pretending otherwise.

### 6.4 Password policy

Enforced on the client for feedback and re-enforced on the server, which is where it counts.

- 3–128 characters, counted as Unicode code points after normalization.
- Rejected: equal to or containing the id; a single repeated character; a monotonic run;
  any of the 1,000 most common passwords (bundled list, checked both sides).
- No forced composition classes. They measurably produce worse keys.
- NFKC-normalize once, then UTF-8 encode. Same rule as everywhere else in this document.
- A strength hint while typing, plus a "share this password over a different channel than
  the id if you can" hint that is advice, not a rule.
- Users will reuse passwords across transfers. The blocklist and the 3-character floor are
  the only defenses, and §6.7 is written on that assumption.

### 6.5 Verification

- Recompute `V` and compare with a constant-time comparison over equal-length buffers.
  Never `===` on derived bytes, never an early return on length mismatch before the
  compare is padded.
- **One error for every failure**: unknown id, destroyed session, wrong password and
  over-attempt all return `No such transfer, or the password didn't work.` with HTTP 404.
  A wrong id and a wrong password must be indistinguishable, in body, status and timing —
  including running a dummy scrypt for the unknown-id path so the clock does not answer
  the question the body refuses to.
- Metadata (name, size) is revealed only *after* the password verifies, so an id alone
  leaks nothing about what is being sent.

### 6.6 Attempts and throttling

- 5 failed verifications against a session, then **the session is destroyed** and both
  sockets are closed with `error{code:'too-many-attempts'}`. Not a lockout with a
  cooldown: a four-minute session has no meaningful cooldown window, and killing it is
  both simpler and strictly safer.
- Per IP: 20 failed claims in 10 minutes across all sessions, to stop spraying ids.
- Creating sessions is limited per uid (2 open) and per IP (4 open in 10 minutes), so a
  single actor cannot fill the board with ids nobody will claim.
- Counters are in-memory and reset on restart, which is acceptable precisely because
  everything they protect also resets on restart.

### 6.7 No persistence, and what that is worth

Nothing about a session is written down: not the verifier, not the file name, not the
position in the queue. A restart is therefore not a recovery problem, it is an ending, and
the spec treats it as one (§13).

What this buys beyond simplicity:

- No database to leak, patch, migrate or back up.
- No persistent disk, so Render's free tier stops being disqualified by an ephemeral
  filesystem (§14).
- No PII at rest beyond whatever the platform keeps in its own request logs.
- The id stops existing the moment the uploader's socket closes, which is the honest
  behaviour rather than a timeout approximating it.

### 6.8 What this protects, and what it does not

Protects: the password never reaches the server or a log; guessing is capped at five
attempts and then the session dies; holding a valid password still does not receive a
file, because the uploader must confirm the join; an id alone reveals nothing.

Does not protect: the uploader. Someone who has the password and the id can *ring the
doorbell*, and it is a human decision whether to open it — a password shared with the
wrong person is a social problem the design cannot solve, only surface. It also does not
protect against the server itself reading the stream in v1 (§17).

## 7. Components

A separate tree deployed on its own, in its own repository at `../ptransfer` (a sibling of
this project). The web client stays in the shell under `src/`. Everything the server stores lives in process memory.

| Unit | Job | Depends on |
| --- | --- | --- |
| `ptransfer/src/http.js` | Routing, CORS, Origin allowlist, `/status`, `/healthz` | node:http |
| `ptransfer/src/auth.js` | Firebase ID token verification for upload, ported from `api/lib/token.js` | node:crypto |
| `ptransfer/src/sessions.js` | In-memory session registry, id issue, verifier, attempts, TTL, tokens | node:crypto |
| `ptransfer/src/queue.js` | The slot, the FIFO, positions, ETA | nothing |
| `ptransfer/src/room.js` | Seats, mutual confirm, frame pump, acks, resume, teardown | frames |
| `ptransfer/src/frames.js` | Binary header encode/decode, CRC32C | nothing |
| `src/lib/ptransfer/password.ts` | Policy, NFKC, PBKDF2 in a worker | WebCrypto |
| `src/lib/ptransfer/servers.ts` | Server list and `/status` probing | fetch |
| `src/lib/ptransfer/upload.ts` | Read by offset, chunk, window, retransmit | password |
| `src/lib/ptransfer/download.ts` | Sink selection, ordered write, ack, resume | password |
| `src/lib/ptransfer/sink.ts` | `showSaveFilePicker` vs OPFS behind one interface | nothing |
| `src/apps/drop/*` | Upload and download screens, queue position, two bars | all of the above |

`sessions.js` knows nothing about bytes. `queue.js` knows nothing about sockets.
`frames.js` has no imports at all. Firebase verification is ported rather than added as a
dependency: `node:crypto`'s `createPublicKey({ format: 'jwk' })` does what the Worker
version does by hand, over ~120 lines whose cache policy is already understood.

## 8. The two sides

### 8.1 Upload

1. Pick a server. The client probes every configured server's public `/status` and shows
   queue depth, active flag and version, sorted by depth. The choice is the uploader's, so
   a wait is something they picked rather than something that happened to them.
2. Pick the file. The `File` handle is held in memory; nothing is read yet.
3. Choose the password (§6.4).
4. `POST /sessions` with the file metadata. The server issues `{ id, sessionToken }` and
   holds the session in `pending` with no verifier.
5. Only now can the client derive `K`, because the id is the salt (§6.3): it runs the 600k
   PBKDF2 in a worker and sends `PUT /sessions/:id/verifier { K }`. The server stores `V`
   and the session goes live. This second round trip exists because a server-issued id is
   worth more than the request it saves — a client-chosen id would let an uploader pick
   something memorable and help the very guessing §6.6 is trying to stop. A `pending`
   session cannot be claimed and expires in 30 seconds.
6. The uploader opens `/sessions/:id/upload?token=` and stays on a screen showing the id,
   the server, and "waiting for the other side" with a copy button. This socket is the
   session's existence (§6.7).

The uploader's 60-minute absolute TTL is visible as a countdown, because a session that
silently disappears is worse than one that visibly expires.

### 8.2 Download

1. Enter the server, the id and the password. No account, no slash commands, no link.
2. Client derives `K` with the same salt rule and calls `POST /sessions/:id/claim { K }`.
3. Wrong password, wrong id, expired session: one 404 and one sentence (§6.5). Five of
   those and the session dies (§6.6).
4. On success the downloader's socket attaches and the uploader is told someone is at the
   door. File name and size are revealed now, not before.
5. The downloader waits for the uploader's confirm, then confirms the destination (§8.3).

### 8.3 Mutual confirmation

Two yeses, and they mean different things:

- **The uploader confirms the join.** They see that someone presented a valid password and
  can accept or deny. A leaked password alone does not receive a file. Denial returns the
  session to `waiting` and tells the downloader the offer was declined; it does not destroy
  the session, because the uploader may simply have fumbled.
- **The downloader confirms the destination.** After the join is accepted they see the file
  name and size, pick where it lands (§12), and confirm. This is also where a 4 GB file
  gives them a chance to say "no thanks".

Only when both are true does the session become `confirmed`, claim a queue position (§9.2)
and become eligible for the slot.

### 8.4 States

`pending` (id issued, no verifier yet) → `waiting` (no downloader) → `claimed` (password
verified, awaiting the uploader) →
`joined` (uploader accepted, awaiting the destination) → `confirmed` (both yes, queue
position held) → `active` (slot open, pumping) → `done`.
Exits from any state: `expired`, `denied`, `aborted`, `too-many-attempts`, `drained`.

## 9. The queue

One slot per server. Everything else waits. This is the capacity model, not an overload
fallback, so it is designed like a feature.

### 9.1 The slot

- `slot` is `null` or one active session. "At most one pump per process" is enforced by a
  guarded assignment that throws if violated, and published at `/status` as
  `{ active: 0 | 1, queueDepth, measuredBytesPerSec }`.
- Release happens on `done`, `cancel`, either socket dying, the start-window timeout
  (§9.4), and drain. It is one function, so no path can forget, and it always pulls the
  head of the queue.

### 9.2 Admission

- A queue position is claimed only at `confirmed` (§8.3). **An unclaimed session holds no
  position**, so nobody can squat the machine by uploading files no one will ever take.
- Ordering is strict FIFO by confirmation time. No priorities and no shortest-job-first:
  with one slot, either one lets a big transfer starve forever, and a queue whose order you
  cannot predict is worse than a wait you can see.
- Caps: 32 queued per server, 2 queued per uploader, 64 open sessions per server. Full
  returns 503 with `Retry-After` and, since the client picked the server, a pointer to the
  least-loaded one.

### 9.3 Head-of-line blocking is the design

A 4 GB transfer at the head delays everyone behind it. That is the honest consequence of
one transfer per server, and the estimate makes it legible. Capacity is a number of
servers, and adding one adds exactly one transfer.

### 9.4 Position, estimate, and the start window

- Position is the FIFO index plus one, counted from the front, so the running transfer
  means you are "next" rather than "first".
- Estimate is `(remaining bytes of the active job + sizes ahead) / measured throughput`,
  with a 2 MB/s prior before the first ack, shown as a range ("about 3–6 minutes"). A single
  number on a network link is a lie.
- Recomputed on every ack batch but pushed at most once a second, to both participants, and
  immediately on any queue mutation. Both sides see the same numbers: a countdown that
  disagrees between two screens destroys trust in a queue faster than any bug.
- At the head with the slot free, both sides get a 60-second start window to open their
  room sockets. If either fails, the session is aborted and the slot passes on — this is
  what stops a dead pair from wedging the machine.

### 9.5 Restart and drain

- The queue is memory. A restart loses it. Both sides are told `error{code:'restart'}` and
  can start over; there is nothing to recover, which is the point.
- On `SIGTERM` the instance refuses new sessions, tells queued participants the server is
  draining, and either lets the active transfer finish inside the grace window or cuts it
  with a clear message. Render allows the shutdown delay to be raised to 300 s for exactly
  this reason.
- Not built: fair-share scheduling, preemption, reserved slots, cross-server queue
  balancing. Servers are independent; the client picks.

## 10. Wire protocol

Each participant holds one socket to the room from the moment they join. Control is JSON
text frames; data is binary frames. Both directions.

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

Control: `hello{role}`, `waiting`, `joined{name,size,type,lastModified}`, `confirm`,
`deny`, `queued{position,etaLow,etaHigh}`, `ready`, `ack{seq,received}`, `resume{from}`,
`pause`, `cancel{reason}`, `done{bytes}`, `error{code}`.

**Backpressure is one chunk deep.** The server does not buffer. It calls
`dst.send(frame, cb)` for exactly one chunk and does not read the next frame from the
sender until that callback fires. If the receiver's disk stalls, the callback stalls, the
sender's socket fills, TCP pushes back on the sender, and `file.slice()` stops being
called. No queues, no `bufferedAmount` heuristic, no unbounded memory.

The 16-chunk window is therefore a *sender-side* limit bounding work in flight before an
ack, not a server-side queue. Acks are batched every 8 chunks or 50 ms. An ack means
*written to the sink*, not *received by the socket* — that is what makes the second
progress bar honest.

Resume: after a reconnect, the receiver sends `resume{from: seq}`; the sender seeks with
`file.slice(seq * chunkSize)` and continues. No bookkeeping beyond a sequence number,
because the source is a file and seeking is free.

Integrity: per-chunk CRC32C plus a total byte count at `done`. There is no streaming
SHA-256 in WebCrypto and `node:crypto` needs a per-transfer state object, so the spec does
not claim what it cannot do.

Ordering: the receiver writes strictly in sequence order, holding out-of-order arrivals in
a reorder buffer bounded by the window.

## 11. Sender pump

Read from the `File` by offset in 256 KiB slices, keep at most 16 unacked, retransmit a
chunk whose ack never arrives, never read the file into memory. The source may be
arbitrarily large; the footprint stays at the window size.

While `waiting`, `claimed`, `joined` or `queued`, the sender holds only the file handle —
no stream, no buffered chunks — so a waiting session costs a socket and a few hundred
bytes.

The uploader's tab must stay open for the duration, including the wait. The UI says so
before the transfer starts rather than after it fails.

A client with several files selected may send them one at a time: each becomes its own
session that re-enters the queue when the previous finishes. One line of client behaviour,
no protocol change.

## 12. Receiver sink

One interface: `open(meta) → { write(seq, bytes), close(), abort() }`.

- **The destination is chosen at confirmation, not at claim.** Asking for a save location
  and then making someone stare at a picker for eight minutes is worse than asking at the
  moment the bytes start.
- Chromium: `showSaveFilePicker()` then stream through `createWritable()`.
- Firefox 111+ and Safari 15.2+: OPFS with `createSyncAccessHandle()` in a dedicated
  worker, then hand the finished file out as a download and delete the temp on success.
  Still disk-backed, so the memory ceiling mostly dissolves. Baseline since March 2023,
  worker-only, secure context.
- Both pumps run in Web Workers so the shell stays responsive; `File` is structured-
  cloneable into a worker and `slice()` works there.
- No cross-origin isolation needed; `vite.config.js` sends `COOP`/`COEP` as `unsafe-none`
  and nothing here wants `SharedArrayBuffer`.
- If neither sink exists, refuse to receive above 512 MB rather than pretend.

## 13. Failure modes

| Failure | Behaviour |
| --- | --- |
| Wrong id or password | One 404, one sentence; indistinguishable from each other |
| 5 failed claims | Session destroyed, both sockets closed |
| Session expires (30 min idle, 60 min absolute) | Both told; the id stops existing |
| Uploader closes tab | Session ends immediately; a downloader mid-transfer keeps its partial file |
| Downloader closes tab | Slot released, uploader told |
| Uploader denies the join | Downloader told the offer was declined; session returns to `waiting` |
| Queue full | 503 with `Retry-After` and a pointer to the least-loaded server |
| Queue wait exceeds 10 min | Job expires; both told "no slot freed up", nothing sent |
| Confirmed party disconnects before the slot | Session aborted, queue closes up |
| Network blip mid-transfer | Reconnect with the session token, `resume{from: seq}`, continue |
| Disk write fails | Abort with the reason; partial file left where the user chose |
| Server redeployed (SIGTERM) | Drain: no new sessions, queued told, active transfer finishes or is cut clearly |
| Instance restarts / OOM | Everything ends; both sides see a drop and are told why |

Partial files are never deleted without telling the user. A half-received 4 GB file is
still their file.

## 14. Deployment

Servers are **independent and identical**. Nothing coordinates between them, because
nothing needs to: the client picks a server and both parties meet on it.

- Web Service, Docker or Node runtime, `npm start`, health check `/healthz`. All traffic on
  one port; WebSockets ride the same port as HTTP.
- **Free tier is viable again.** With no database and no disk, the ephemeral filesystem
  stops mattering. The remaining caveat is spin-down after 15 minutes of idle, which will
  kill a session that is sitting in `waiting`; a transfer in progress keeps the instance
  awake because WebSocket messages count as traffic. Paid instances remove the cliff.
- Server list lives in the shell's config (`DROP_SERVERS`), not on the server side. Each
  entry is a public origin. Adding capacity is adding a URL to that list.
- Every server exposes `GET /status` publicly and CORS-open: `{ active, queueDepth,
  measuredBytesPerSec, version }`. This is what lets the picker show real queue depths, and
  it must stay free of anything sensitive.
- Env per server: `DROP_ORIGINS`, `FIREBASE_PROJECT_ID`, `PORT`. No database path, no
  key pepper, no cluster secret, no ticket secret — those all retired with §6.7, and
  session tokens are random 32-byte values rather than signed ones.
- **Origin allowlist on upgrade.** Cross-site WebSocket hijacking is real: browsers send
  cookies and any page can open a socket to your endpoint. `Origin` is checked against
  `DROP_ORIGINS` on every upgrade and a mismatch is refused before the handshake completes.
- CORS stays header-based (`Authorization: Bearer` on upload only), so
  `Access-Control-Allow-Origin` names the shell origin explicitly rather than `*`.
- `X-Forwarded-For` is trusted only behind the platform proxy.
- `SIGTERM` drains immediately (§9.5).

## 15. Limits and cost

- 2 open sessions per uploader, 4 per IP in 10 minutes, 32 queued per server, 2 queued per
  uploader.
- No hard size cap. A warning and a visible time estimate above 2 GB.
- **Bandwidth is the dominant cost, and it is doubled.** Every byte crosses the server
  twice: once inbound, once outbound. A 2 GB file is 2 GB in and 2 GB out, so a free
  instance's 5 GB/month is roughly 2.5 GB of actual transfers. This is the main argument
  for revisiting WebRTC later.
- Memory is flat by design (§10): two sockets and one 256 KiB frame buffer per active
  session; a waiting session is a socket and a few hundred bytes.

## 16. Testing

- `node:test` throughout; no test framework.
- Password policy table tests: accept/reject, NFKC equivalence, code points vs bytes.
- Derivation vectors pinned for both stages, including the id-as-salt rule.
- Attempts: the fifth failure destroys the session and closes both sockets.
- Uniform failure: unknown id, wrong password and destroyed session produce byte-identical
  responses *and* comparable timing (assert the unknown-id path runs its dummy scrypt).
- Metadata is not disclosed before verification.
- **Queue as pure functions first:** FIFO under interleaved confirmation; the slot
  invariant under concurrent release; abort frees a position; caps returning 503 before any
  claim; position and ETA monotonic as the active transfer progresses.
- **Queue over real sockets:** two confirmed sessions, one slot, asserting the second never
  starts before the first finishes and both sides see the same position throughout.
- Frame round-trip, CRC mismatch, malformed and oversized length rejection.
- Two-client integration with a forced drop at chunk 100 and a resume proving the bytes
  match.
- The no-blocking test from §5.3.
- A 1 GB soak asserting flat RSS while a second session waits in the queue.

## 17. Phase 2: end-to-end encryption

This model makes E2E **easier** than the identity model it replaced, and the reason is
worth stating precisely.

Both parties deliberately share one secret, so there is already an out-of-band channel: the
password itself. That removes the fingerprint ceremony the earlier design needed. But it
does not make the naive version safe — the server receives `K` in §6.3, so anything derived
from `K` is not secret from the server, and a malicious relay could sit in the middle.

The correct construction is a **PAKE (SPAKE2)**: the client proves knowledge of the password
and both sides derive a shared key the server never learns, storing only a PAKE verifier. At
that point:

- The verifier replaces `scrypt(K)` in §6.3, and `K` never crosses the wire at all.
- Each chunk is sealed with an AEAD key derived per chunk from a counter, so the relay
  moves opaque bytes.
- No fingerprint is needed, because the password was the out-of-band secret all along —
  which is exactly why this model is better for E2E than a published public key.

## 18. Risks

1. Password reuse is endemic. A 3-character floor and a blocklist are weak defenses; the
   five-attempt kill and the uploader's confirmation are the real ones.
2. An id is enumerable in principle at 30 bits. Attempt caps and per-IP throttles make
   enumeration useless in practice, not impossible in theory.
3. Both sides must stay present for the whole thing, including the wait. That is the same
   property that makes the product trustworthy.
4. One transfer per server means one bad job delays everyone behind it. Deliberate; the
   estimate is what keeps it honest.
5. A restart loses every session and the queue. A redeploy is a restart.
6. Bandwidth doubling means cost scales with what people send, which store-then-download
   would not.
7. Three fields is more to communicate than one link. That is the deliberate cost of never
   putting a credential in a URL.
8. In v1 the server can read the stream. §17 is the fix, and it is a whole phase, not a
   flag.

## 19. Build order

1. `frames.js` + pure window/ack logic, with tests. No networking.
2. `queue.js` with the slot invariant, FIFO, positions, ETA and caps — pure, with tests,
   before any socket exists.
3. `sessions.js`: id issue, PBKDF2/scrypt verification, attempts, TTL, tokens.
4. `room.js` pump over a local Node process, two headless clients, one file.
5. The upload and download screens, including mutual confirmation.
6. Sender and receiver pumps, Chromium sink, then the OPFS fallback.
7. `servers.ts` picker and `/status` probing.
8. `http.js` hardening: Origin allowlist, CORS, drain on SIGTERM, `/healthz`, `/status`.
9. 1 GB soak with a second session queued, then the phase-2 PAKE envelope.
