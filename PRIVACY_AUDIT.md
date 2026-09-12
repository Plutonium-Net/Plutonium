# Plutonium Network — Data Collection & Privacy Audit

> **Date:** September 11, 2026
> **Scope:** A static, read-only review of every piece of user information the platform collects, where it is stored, which third parties receive it, how long it survives, and whether it can be deleted.
> **Result:** 10 findings (2 High-risk backend defects, 4 High, 3 Medium, 1 Low). No analytics, telemetry, or fingerprinting was found. Two findings **cannot be confirmed without a live signed-in round-trip** (see [§10 Open Questions](#10-open-questions--not-verifiable-from-this-repository)).

---

## 1. Executive Summary

The client collects **very little passive telemetry** — there is no analytics SDK, no ad tracker, and no fingerprinting — but it collects a **large amount of high-sensitivity behavioural data** as first-class product features: a full browsing history, every open tab URL, complete AI conversation transcripts, an inferred profile of the user, streaming watch progress, gameplay saves, and raw microphone audio.

Nearly all of that is stored **per-user in Firestore** (`users/{uid}/…`) and is uploaded automatically once a user signs in. There is no per-feature opt-out — the only way to stop the upload is to sign out — and there is no privacy policy, consent surface, or retention statement anywhere in the product.

The most serious problems are on the **backend deletion and authorization path**, not in what the client collects:

| # | Severity | Finding | Area |
|---|----------|---------|------|
| 1 | **High-risk** | Account deletion skips `history`, `ai_memory`, `ai_personas`, `nav_prefs` and `pg_files` — and the purge calls send **no `Authorization` header**, so they either are unauthenticated (rules-permitted) or fail silently | `cf-worker/firebase-gateway` |
| 2 | **High-risk** | The Firestore proxy forwards the **client-supplied path verbatim** and never verifies it is scoped to the caller's `uid` | `cf-worker/firebase-gateway` |
| 3 | High | The **refresh token lives in `localStorage`**, on an origin that executes a third-party remote script | `js/cloud-store.js`, `js/workspaces.js` |
| 4 | High | All proxied browsing traffic transits **third-party relay servers** (`wisp-*.cgamz.online`) that can see destination URLs and cookies | `js/net.js`, README |
| 5 | High | AI conversations, **automatically extracted personal facts**, and **raw voice recordings** leave the device with no consent, retention control, or disclosure | `js/ai.js`, `cf-worker/groq-worker` |
| 6 | High | **No privacy policy, terms, consent, or data-notice** exists anywhere in the product | repo-wide |
| 7 | Medium | **Hardcoded API keys** for TMDB and the cloud-gaming API ship in client code | `js/stream.js`, `js/cloud.js` |
| 8 | Medium | The "export my data" feature **omits the most sensitive documents** (AI memory, personas, avatar, streaming, personal games) | `js/account.js` |
| 9 | Medium | Deleted history entries leave **tombstones for 30 days**, locally *and* in the cloud | `js/history.js` |
| 10 | Low | Synced settings push a **bogus `wispServer` value** (a UI state string instead of the chosen relay) | `js/account.js` |

Findings 1 and 2 are backend-only, high-impact, and cheap to verify. They should be addressed before any other item in this document.

---

## 2. Method & Limits

**What was reviewed:** the client (`js/*.js`, `index.html`, `onboarding.html`, `sw.js`, `manifest.json`), the four Cloudflare Workers under `cf-worker/` (`firebase-gateway`, `groq-worker`, `net-worker`, `vm-worker`), the bundled proxy runtimes in `core/` and `runtime/`, and the two existing documents (`SYNC_AUDIT.md`, `CLOUD_STORE.md`).

**What was *not* possible:** the review is static. I did not sign in, run the app, or query any deployed service. Consequently the following are **outside the visibility of this repository** and are treated as open questions rather than findings:

- Firebase Security Rules (which are the *only* thing enforcing cross-user isolation — see finding 2).
- Actual retention windows at Cloudflare (logs), Groq, Hyperbeam, TMDB, and the wisp relay operators.
- The live behaviour of the workers under real tokens (see [§10](#10-open-questions--not-verifiable-from-this-repository)).

**Privacy posture in one line:** the client-side architecture is deliberately conservative about *passive* collection, and unusually disclosive about *active* collection.

---

## 3. What Is Not Collected (Verified Clean)

These are the usual suspects, and each was checked and found absent. Recording them matters as much as the findings, because it constrains how bad the picture is.

| Checked | Result |
|---|---|
| Analytics / product telemetry SDK (`gtag`, Segment, PostHog, Mixpanel, Amplitude, Sentry) | **None.** A case-insensitive search for `analytics`, `gtag`, `sentry`, `telemetry`, and `track(` returns no collection code. |
| Ad or marketing trackers | **None** — and `sw.js` actively **blocks** dozens of ad/analytics domains (`analytics.twitter.com`, `.adnxs.com`, `.criteo.com`, …). |
| Device fingerprinting | **None.** `js/device-detect.js` reads `navigator.userAgent`, `navigator.userAgentData.mobile`, `maxTouchPoints` and screen-independent signals **only to display a desktop-only block screen**; nothing is stored or transmitted. |
| Screen / CPU / memory enumeration (`screen.*`, `hardwareConcurrency`, `deviceMemory`, `Intl` timezone probes) | **None found.** |
| Geolocation API (`navigator.geolocation`) | **Not used.** Approximate location is derived from the user's **IP** by a third party instead (see [§7](#7-third-party-destinations)). |
| Clipboard **reads** | **None.** `navigator.clipboard.writeText` is used (context menu, copy buttons) — write-only. |
| Camera / video capture | **None.** Only microphone audio, and only in AI Talk mode. |
| Age / birth-date / identity verification | **None collected.** Adult content is a self-serve toggle (see [§6](#6-cloud-synced-data)). |
| Contacts, filesystem enumeration, `showSaveFilePicker` | **None.** File input is limited to an HTML-upload picker and an avatar picker. |
| BYOK leakage | `cf-worker/groq-worker/index.js` accepts an `X-Groq-Key` header, but **no client code ever sends it** — so a user's own Groq key is never transmitted or stored. |

---

## 4. Identity & Account Data

| Data | Where it lives | Notes |
|---|---|---|
| `uid`, `email`, `displayName`, `photoUrl` | `localStorage.plu_user` + Firebase Auth | Mirrored into in-memory `accountManager.user` (uid, email, displayName, photoURL) |
| `idToken`, `refreshToken`, `expiresAt` | **`localStorage.plu_user`** | Full session, including the long-lived refresh token, in web storage — see finding 3 |
| Password | Firebase Auth only | Transmitted through the worker (`/auth/email`, `/auth/signup`) to `identitytoolkit.googleapis.com`; never persisted client-side |
| OAuth identities (Google, GitHub) | Firebase Auth | Linked/unlinked via `/auth/link` and `/auth/unlink`; provider list read via `/auth/providers` |
| Profile photo (user upload) | `localStorage.plu_avatar_{uid}` + Firestore `profile_photo` | Client-side square crop/resize to 256 px WebP (fallback JPEG), stored as a base64 `data:` URL |
| Email-derived avatar hash | Sent to **`gravatar.com`** | `js/account.js` SHA-256s the lowercased email and requests `gravatar.com/avatar/<hash>`; a third party thus receives a **stable identifier derived from the user's email** |
| Password-reset request | Firebase | `/auth/reset` with the supplied email |
| Display-name change | Firebase Auth | `PlutoniumStore.updateProfile(val)` |

The client never holds Firebase credentials; `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `GROQ_API_KEY`, and `HYPERBEAM_API_KEY` are Cloudflare Worker environment variables. However `/config` is **unauthenticated** and returns the Firebase API key and project ID to any caller.

---

## 5. Device-Local Data

These keys are written to `localStorage` (and one IndexedDB database) on the user's device. Under [§6](#6-cloud-synced-data), most of them are also pushed to the cloud whenever a user is signed in.

| Key / store | Contents |
|---|---|
| `plu_user` | Session: uid, email, displayName, photoUrl, **idToken, refreshToken**, expiresAt |
| `plu_bookmarks` | Bookmarks: url, title, cached favicon |
| `plu_pins` | Home-screen pins: pinned games + VM quick-launch |
| `plu_tabs` | Open-tab snapshot: url, title, active flag |
| `plu_recent` | Up to 10 "Continue From Where You Left Off" entries |
| `plu_history` | Up to **600** history entries: type, title, sub, href, proxy engine, timestamp |
| `plu_history_deleted` | Deletion tombstones (`id` → timestamp, 30-day TTL) |
| `plu_games_data` | Games library: recently played, favourites |
| `plu_theme`, `plu_net_mode`, `plu_relay_server`, `plu_onboarded` | Appearance, proxy engine, relay choice, onboarding flag |
| `plu_ai_chats` | All AI conversation transcripts + active chat id |
| `plu_ai_personas` | Up to 50 custom personas (name, emoji, system prompt ≤ 4000 chars) |
| `plu_ai_memory` | Up to 200 "facts" the AI extracted about the user, plus the memory-enabled flag |
| `plu_ai_voice` | Selected TTS voice |
| `plu_gravatar_{uid}`, `plu_avatar_{uid}` | Avatar resolution state and the cropped avatar image |
| IndexedDB `plutonium_personal_games` | `pg_meta` (game metadata) and `pg_files` (uploaded HTML source, ≤ 1 MB each) |
| `cg_*` (legacy) | Migrated on first load into the `plu_*` equivalents |

---

## 6. Cloud-Synced Data

Once signed in, `accountManager._startSync()` pushes on an 8-second interval, on change (debounced 1.2–2 s), and on sign-out. Firestore documents live at:

```
users/{uid}/{collection}/_default        (simple collection names)
users/{uid}/{collection}/{docId}         (paths containing "/", e.g. game_saves/{id})
```

| Document path | Contents | Sensitivity |
|---|---|---|
| `bookmarks/_default` | Bookmark list (url, title, favicon) | **High** — reveals sites of interest |
| `history/_default` | Up to 600 entries incl. **search terms and every visited URL**, engine, timestamps, plus tombstones | **Critical** — a complete browsing record |
| `recent/_default` | Last 10 "continue where you left off" items | High |
| `tabs/_default` | Every open tab's URL, title and active state | High |
| `pins/_default` | Pinned games / VM launch | Low |
| `settings/_default` | Theme (incl. custom background image), proxy engine, relay, onboarding flag | Low |
| `profile_photo/_default` | Base64 avatar image | Medium — biometric-adjacent |
| `ai_chats/_default` | **Every conversation transcript**, chat titles, selected voice | **Critical** |
| `ai_memory/_default` | **Facts inferred about the user** (key/value, ≤ 200), deletion tombstones, enabled flag | **Critical** — a derived profile, not just raw data |
| `ai_personas/_default` | Up to 50 custom system prompts | Medium |
| `games_data/saved` | Recently played / favourites | Low–Medium |
| `game_saves/{gameId}` | Arbitrary per-game save blobs (≤ 900,000 chars) | Medium — opaque, may contain personal content |
| `personal_games/meta`, `pg_files/{id}` | Uploaded game names + **full HTML source** | Medium |
| `stream_favorites/_default` | TMDB favourites | Medium |
| `stream_continue/_default` | **What was watched and how far into it** | High — viewing habits |
| `stream_prefs/_default` | `adultContent` boolean | Sensitive — infers adult-content use |
| `nav_prefs/_default` | Navigation layout | Low (documented in `CLOUD_STORE.md`; the module is not present in this build) |

**Key point:** there is no way for a user to keep any of this on-device. Signing in enables all of it, and there is no per-feature switch.

---

## 7. Third-Party Destinations

Every outbound destination reachable from this codebase, and what it receives:

| Destination | What it receives |
|---|---|
| **Groq** — via `ai.cdn.plutoniumnet.work` | Full chat prompts **including the injected "Known facts about this user" block**, TTS input text, and **raw microphone audio** (`/transcribe`, Whisper). Retention is governed by Groq's policy, not by Plutonium. |
| **Hyperbeam** — via `vm-worker` / `net-worker` | `start_url` for each remote session — i.e. **the exact URL the user is remotely browsing** — plus session IDs. A VM session is a remote browser running on the user's behalf. |
| **TMDB** (`api.themoviedb.org`) | Search queries and item IDs, authenticated with a **hardcoded API key** (`js/stream.js:2`) |
| **Videasy / VidCore** | TMDB item IDs (and season/episode) embedded in the player URL |
| **Google** | `suggestqueries.google.com` for omnibox autocomplete (`js/newtab-search.js:56`), and `google.com/s2/favicons` for **every bookmarked or visited domain** (`js/bookmarks.js:36`, `js/bookmarks-bar.js:32`, `js/navigation.js:262`) — Google learns the user's domain list from favicon requests alone |
| **Gravatar** | SHA-256 of the user's lowercased email address |
| **ipapi.co** | The user's IP address, returning approximate latitude/longitude used to pick the nearest relay (`js/net.js:49`). This fires on startup. |
| **wisp relays** (`wss://wisp-*.cgamz.online`, `js/net.js:2`) | **All proxied browsing** — request URLs, headers, and cookies for every site visited through the UV/Scramjet engines pass through third-party-operated relay infrastructure. `README.md` documents this as intentional. |
| **Plutonium CDNs** (`g.`, `cgapi.`, `vm.`, `ai.`, `net.`, `accounting.cdn.plutoniumnet.work`) | IP, User-Agent, and request path on every call (via Cloudflare). Game CDN traffic reveals which titles are fetched. |
| **unpkg.com** | The Hyperbeam SDK is `import`ed remotely at runtime (`js/vms.js:1`) |
| **cdn.jsdelivr.net** | `js/workspaces.js:176` loads `lumin.min.js` from a **third-party GitHub repository**, executing it **inside the application's own origin** — see finding 3 |
| **GitHub** (`api.github.com`, `raw.githubusercontent.com`) | Repository paths when importing a personal game |
| **Firebase / Google Cloud** | Authentication and every Firestore document in [§6](#6-cloud-synced-data) |

---

## 8. What the Servers Collect and Keep

### 8.1 Rate limiting (Cloudflare KV)

| Worker | Key derivation | Assessment |
|---|---|---|
| `groq-worker` | For authenticated calls, a **64-character prefix of the base64 JWT payload** (`rl:<payload>`) — that prefix contains `user_id`/`sub` and likely the beginning of the `email` claim. For unauthenticated calls, `rl:ip:<CF-Connecting-IP>`. | Stores a **pseudonymous identifier that embeds the uid**, plus the raw IP on anonymous calls. Short TTL; but it is identity-derived data persisted server-side. |
| `vm-worker` | `auth.slice(7, 39)` — the first 32 characters **after `Bearer `**, which is the **JWT header**, not a per-user value | Two problems: it is not identity data at all, and because the header is identical for all users, **every VM user shares a single rate-limit bucket** (`cf-worker/vm-worker/index.js:67-71`). This is a functional bug as well as a data-hygiene note. |
| `groq-worker` / `vm-worker` (anonymous) | `CF-Connecting-IP` | The user's IP is written to KV for the duration of the rate-limit window. |

### 8.2 Logging

No Worker logs request bodies. `console.error(...)` is used only for thrown error objects in the top-level `catch` of each worker. Beyond that, IP/User-Agent/path metadata is retained by Cloudflare's own logging, which is outside this repository.

### 8.3 Account deletion

`handleAccountDelete` (`cf-worker/firebase-gateway/index.js`) looks up the uid from the id token, deletes the Firebase Auth user, then calls `deleteUserFirestoreData(env, uid)`. What that function actually does is the subject of finding 1 — it is both incomplete and, as written, very likely a silent no-op.

### 8.4 Secrets

`FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `GROQ_API_KEY`, and `HYPERBEAM_API_KEY` are Worker environment variables and never appear in client bundles. The two credentials that *do* ship to the browser are hardcoded (finding 7).

---

## 9. Findings

### 9.1 High-risk — Account deletion is incomplete and probably fails silently

**File:** `cf-worker/firebase-gateway/index.js` · `deleteUserFirestoreData()` (≈ lines 364–385), `deleteFirestoreDoc()`, `deleteFirestoreCollection()`

Two independent defects:

1. **Incomplete purge.** The function deletes a fixed list plus the `game_saves`, `personal_games`, and `games_data` collections. It **never deletes**:
   - `users/{uid}/history/_default` — the user's **entire browsing history**
   - `users/{uid}/ai_memory/_default` — the **inferred profile**
   - `users/{uid}/ai_personas/_default`
   - `users/{uid}/nav_prefs/_default`
   - `users/{uid}/pg_files/*` — **uploaded HTML game files** (a separate top-level collection, not covered by the `personal_games` loop)

2. **No credentials on the purge requests.** `deleteFirestoreDoc` issues `fetch(url, { method: 'DELETE' })` and `deleteFirestoreCollection` issues `fetch(url + '?pageSize=300')` — **neither sets an `Authorization` header**, and both swallow every error in `try { … } catch (_) {}`. Only one branch can be true:

   - **If Firestore rules require authentication** (expected): every delete returns 403, the error is swallowed, `deleteUserFirestoreData` resolves successfully, the client reports "account deleted", and **all of the user's cloud data remains indefinitely**.
   - **If Firestore rules permit unauthenticated access**: the project's data is readable and deletable by anyone who knows the project ID — a far larger exposure.

   Either way this is a defect; the first branch means the product's deletion promise is not met, and the second means the whole dataset is exposed.

Additionally, `deleteFirestoreCollection` fetches at most 300 documents and does not paginate, so collections larger than that are only partially purged.

**Recommended action:** verify the rules immediately (see [§10](#10-open-questions--not-verifiable-from-this-repository)), then (a) forward the caller's verified credential on every delete, (b) paginate the collection loops, (c) add the five missing paths, and (d) stop swallowing errors so a partial deletion surfaces to the user.

### 9.2 High-risk — The Firestore proxy does not enforce per-user path scoping

**File:** `cf-worker/firebase-gateway/index.js` · `handleFirestore()` (≈ lines 539–546)

```js
const firestorePath = path.replace(/^\/firestore/, '');
const upstream = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${firestorePath}`;
```

The client sends `/firestore/users/<uid>/<collection>/_default` (`js/cloud-store.js`, `setDoc`/`getDoc`/`deleteDoc`, which correctly interpolate `_requireUser()`), and the worker forwards whatever it is given. There is **no server-side check** that the path begins with `/users/{uid}/` for the verified token's `sub`.

Consequences: the only barrier to reading or writing another user's documents is Firebase Security Rules. This is compounded by the **already-open question in `SYNC_AUDIT.md` §8** — the worker forwards a *Firebase ID token* where Firestore's REST API nominally expects a *Google OAuth access token*. If that mismatch is tolerated, the project's rules must be permissive enough for the calls to succeed; permissive rules plus an unvalidated, client-controlled path is a complete cross-user read/write exposure.

**Recommended action:** derive the scope server-side from the verified token (`sub`) and reject any path that does not match it, rather than trusting the path the client sends. This is a small, deterministic change and it removes an entire class of risk regardless of how the rules are configured.

### 9.3 High — Refresh token in `localStorage`, on an origin that executes third-party code

**Files:** `js/cloud-store.js` (`_persist`, `_restoreSession`), `js/workspaces.js:176`

The full session — including `refreshToken`, which is long-lived and sufficient to mint new id tokens indefinitely — is stored as JSON in `localStorage.plu_user`. `localStorage` is readable by any script running in the origin. The same origin (`js/workspaces.js:176`) loads and executes `https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js` — a **remote, unpinned script from a third-party repository** (note `@latest`), loaded into the games workspace.

This creates a concrete compromise chain: a change to that upstream repository (or its CDN, or the account that owns it) yields code execution in the app's origin, which can read `plu_user` and exfiltrate every user's refresh token. A stolen refresh token grants full account takeover, which in turn unlocks every document in [§6](#6-cloud-synced-data) — including the user's browsing history and inferred profile.

**Recommended action:** vendor the script into the repository (and pin it), and reduce blast radius by keeping the refresh token out of `localStorage` — ideally by moving session handling behind the worker with an httpOnly cookie.

### 9.4 High — All proxied browsing transits third-party relays

**Files:** `js/net.js` (relay configuration and `resolveRelayUrl`), `README.md`

Every page loaded through the UV (`core/`) or Scramjet (`runtime/`) engines is proxied through `wss://wisp-*.cgamz.online` — infrastructure operated outside Plutonium's account control. The relay operator can observe destination URLs, request headers, and (for proxied sites) cookies and credentials. `README.md` records this as an intentional remaining third-party dependency, which is fine as an engineering decision but is not disclosed anywhere in the product itself.

For a platform whose stated purpose is helping users "evade" censorship and school filtering, the gap between what users will assume and what the architecture does is significant.

**Recommended action:** disclose the relay path plainly in-product (not just in the README), and consider offering a user-supplied or self-hosted relay.

### 9.5 High — AI data leaves the device with no consent, retention control, or disclosure

**Files:** `js/ai.js` (`requestReply`, `composeSystem`, `pushChats`, `pushMemory`, `beginListen`, `runLiveTranscribe`, `playTts`), `cf-worker/groq-worker/index.js`

Per conversation turn, the following leaves the device:

- **The complete message history** of the active chat, sent to `/chat` and forwarded to `api.groq.com`.
- **An automatically assembled profile of the user.** `composeSystem()` injects a `## Known facts about this user` block built from `facts`, and new facts are extracted from model output and saved automatically (`extractMemory` → `saveFact`) with no per-fact confirmation. Those facts are then synced to Firestore (`ai_memory`).
- **Raw microphone audio.** In Talk mode, `navigator.mediaDevices.getUserMedia({ audio: true })` captures continuous audio, which is periodically uploaded to `/transcribe`.
- **Reply text**, sent to `/tts` for speech synthesis.

There is no disclosure that transcripts and memory facts are stored in the cloud, no retention control, and no way to disable memory extraction other than turning memory off wholesale.

**Recommended action:** disable memory by default or require confirmation per extracted fact; disclose cloud storage of transcripts; and document Groq as a subprocessor with its retention window.

### 9.6 High — No privacy policy, terms, or consent surface

**Files:** repo-wide (searched `*.html`, `*.js`, `*.md` for `privacy`, `terms of service`, `data policy`, `cookie policy`, `gdpr`)

The only matches in the entire repository are two lines inside Stelena's system prompt ("Prioritize user privacy and security", "Protect user privacy"). There is no privacy page, no data notice at sign-up, no consent step, and no link from the About dialog or the account panel.

This matters more than usual here because: (a) the collection includes browsing history and an inferred profile — the two categories regulators treat most strictly; (b) adult content is available behind a self-declared toggle with no age verification; and (c) the About text explicitly positions the product for school Chromebook users, implying a **minor audience** with no accompanying children's-data posture.

**Recommended action:** publish a privacy page describing what is collected, what is synced, every processor (Groq, Hyperbeam, TMDB, Videasy/VidCore, Google, Gravatar, ipapi, the wisp relays, Cloudflare, Firebase), retention, and how to export and delete — and link it from the About dialog and the sign-up form.

### 9.7 Medium — Credentials hardcoded in shipped client code

**Files:** `js/stream.js:2` (`TMDB_API_KEY`), `js/cloud.js:4` (`API_KEY` for `cgapi.cdn.plutoniumnet.work`)

Both keys are embedded in browser-delivered JavaScript and are readable by anyone. They are not user data, but they are part of the trust boundary: a leaked TMDB key can be rate-limited or billed against Plutonium's account, and the cloud-gaming key is sent as a `Bearer` token to the cgapi service.

**Recommended action:** proxy both through a Worker that holds the key server-side, and rotate the current values.

### 9.8 Medium — The data export omits the most sensitive documents

**File:** `js/account.js` · `_bindExport()`

The export bundles `bookmarks`, `pins`, `tabs`, `recent`, `history`, `plu_ai_chats`, `plu_games_data`, and a partial `settings` object. It **omits**:

- `plu_ai_memory` — the inferred profile of the user
- `plu_ai_personas`
- `plu_ai_voice`
- the profile photo (`plu_avatar_{uid}`)
- streaming favourites and continue-watching (`stream_favorites`, `stream_continue`)
- personal games (IndexedDB `pg_files` / `pg_meta`)
- cloud-stored game saves

An export tool that omits the derived profile is misleading about what the service actually holds.

**Recommended action:** include every document in [§6](#6-cloud-synced-data), and prefer pulling the authoritative cloud copies rather than only the local cache.

### 9.9 Medium — Deletion tombstones persist after deletion

**File:** `js/history.js` (`DELETED_KEY`, `TOMBSTONE_TTL_MS = 30 days`, `mergeEntries`)

When a user removes a history entry or clears history, the entry id and a deletion timestamp are written to `plu_history_deleted` locally **and pushed to the cloud `history` document** as `deleted`. They persist for 30 days. This is correct engineering (it prevents a stale cloud copy from resurrecting deleted entries), but it means "deleted" items retain discoverable metadata — an id and a timestamp — for a month.

**Recommended action:** document the behaviour, and drop tombstones from the *cloud* copy sooner than the local one, since the cloud copy is the one that leaves the device.

### 9.10 Low — Synced settings push a bogus `wispServer` value

**File:** `js/account.js` · `_getSettings()`

```js
const relay = localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server')
if (relay) out.wispServer = relayMenuState      // ← UI state string, not the relay
```

`relayMenuState` is `'closed'` / `'open'` (the relay switcher menu's visibility), not the selected relay. The read of `plu_relay_server` above it is unused, so the synced `settings` document contains a meaningless `wispServer` value. This appears to contradict `SYNC_AUDIT.md` §4.5, which records wisp persistence as fixed.

**Recommended action:** assign the read value (`out.wispServer = relay`) and add a round-trip check.

---

## 10. Open Questions — Not Verifiable From This Repository

These determine how severe findings 1 and 2 actually are, and only a live environment can answer them.

1. **Firebase Security Rules.** What do they actually permit? This single question decides whether finding 2 is "missing defence-in-depth" or "the entire dataset is exposed".
2. **Does the Firestore REST proxy work at all?** The worker forwards a *Firebase ID token* where Firestore expects a *Google OAuth access token* (`SYNC_AUDIT.md` §8). Either cloud sync works, or every call 401s and all of [§6](#6-cloud-synced-data) is empty in practice.
3. **Does account deletion actually delete anything?** Per finding 1, one signed-in delete-and-inspect round-trip settles it. I recommend performing this test on a throwaway account as the very first action.
4. **Processor retention windows.** Groq, Hyperbeam, TMDB, Gravatar, ipapi, the wisp relay operator, and Cloudflare each have their own retention policies; none are referenced from the codebase.
5. **Live worker behaviour.** `/config` is unauthenticated; confirm what it exposes in the deployed environment.

---

## 11. Recommended Remediation Order

Ordered by risk reduction per unit of effort. Items 1–4 are backend-only or single-file changes.

1. **Verify Firestore rules** and confirm the deletion round-trip on a throwaway account ([§10](#10-open-questions--not-verifiable-from-this-repository)).
2. **Fix deletion** — forward credentials on all purge calls, surface errors instead of swallowing them, paginate collections, and add `history`, `ai_memory`, `ai_personas`, `nav_prefs`, and `pg_files`. *Note: including `history` and `ai_memory` here is the whole point — those are the two most sensitive documents.*
3. **Scope the Firestore proxy server-side** from the verified token's `sub`; reject any other path.
4. **Vendor and pin the jsdelivr script**, removing third-party code execution from the app's origin.
5. **Reduce token blast radius** — move session/refresh handling behind the worker (httpOnly cookie) or, at minimum, keep `refreshToken` out of `localStorage`.
6. **Publish a privacy page** and link it from the About dialog and sign-up; enumerate the processors above.
7. **Add per-feature sync toggles** for history, AI memory, and watch progress, so the cloud profile becomes opt-in rather than automatic.
8. **Move the TMDB and cgapi keys** behind Workers and rotate them.
9. **Close the export gaps** so "download my data" includes the derived profile and everything else in [§6](#6-cloud-synced-data).
10. **Fix `_getSettings()`** so the synced relay value is the real one.

---

## 12. Files Referenced

| File | Relevance |
|---|---|
| `js/account.js` | Identity, export, settings sync, avatar and Gravatar handling |
| `js/cloud-store.js` | Session persistence, token refresh, all Firestore reads/writes |
| `js/history.js` | Browsing-history recording, cloud sync, tombstones |
| `js/ai.js` | Chat transcripts, memory extraction, personas, microphone and TTS |
| `js/stream.js` | TMDB key and queries, favourites, continue-watching, adult toggle |
| `js/net.js` | Relay servers, IP geolocation, proxy engine selection |
| `js/newtab-search.js` | Google autocomplete queries |
| `js/bookmarks.js`, `js/bookmarks-bar.js`, `js/navigation.js` | Google favicon requests |
| `js/device-detect.js` | UA/mobile detection (local only) |
| `js/personal-games.js`, `js/games.js` | IndexedDB uploads, GitHub imports, game saves |
| `js/vms.js`, `js/cloud.js` | Hyperbeam sessions, cloud-gaming session UUIDs |
| `js/workspaces.js` | Third-party `lumin.min.js` import |
| `sw.js` | Ad/analytics blocking, proxy engine service worker |
| `cf-worker/firebase-gateway/index.js` | Auth proxy, Firestore/RTDB proxy, account deletion |
| `cf-worker/groq-worker/index.js` | Chat/TTS/transcription proxy, JWT-derived rate-limit keys |
| `cf-worker/net-worker/index.js`, `cf-worker/vm-worker/index.js` | Hyperbeam session creation, IP-based rate limiting |
| `SYNC_AUDIT.md` | Companion document (sync correctness); its §8 is directly relevant to finding 2 |
