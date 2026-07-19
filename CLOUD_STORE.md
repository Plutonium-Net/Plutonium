# PlutoniumStore — Cloud Storage API Reference

> **Audience:** This document is written for an AI code assistant. It is the authoritative reference for using `PlutoniumStore` in any Plutonium feature page. Read this file before writing any code that touches user data, authentication, or cloud persistence.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Setup Requirements](#2-setup-requirements)
3. [Script Load Order](#3-script-load-order)
4. [Configuration](#4-configuration)
5. [Authentication API](#5-authentication-api)
6. [Firestore API](#6-firestore-api)
7. [Realtime Database API](#7-realtime-database-api)
8. [Data Path Rules](#8-data-path-rules)
9. [Supported Value Types](#9-supported-value-types)
10. [Error Handling](#10-error-handling)
11. [Auth-Gate Pattern](#11-auth-gate-pattern)
12. [Complete Feature Integration Example](#12-complete-feature-integration-example)
13. [Existing Usages in the Codebase](#13-existing-usages-in-the-codebase)
14. [Constraints and Limitations](#14-constraints-and-limitations)

---

## 1. Architecture Overview

```
Browser (any .html page)
  │
  ├── js/cloud-store.js  →  window.PlutoniumStore  (public API)
  │       │
  │       │  All requests go through the CF Worker. The browser
  │       │  never talks to Firebase directly.
  │       │
  │       ▼
  CF Worker  (cf-worker/firebase-proxy/index.js)
  │       │  Firebase secrets live here only — never in browser code.
  │       │
  │       ├── GET  /config          → returns Firebase app config
  │       ├── POST /auth/token      → exchanges Google token → Firebase ID token
  │       ├── *    /firestore/*     → proxies Firestore REST API
  │       └── *    /rtdb/*          → proxies Realtime Database REST API
  │
  ├── Google Firestore   (structured documents, users/{uid}/*)
  └── Firebase RTDB      (JSON tree, users/{uid}/*)
```

**Key facts:**
- `PlutoniumStore` is a plain IIFE that sets `window.PlutoniumStore`. No bundler or import needed.
- Every data operation is automatically scoped to the signed-in user's UID. You never construct user paths manually.
- All methods are `async` and return Promises. Always `await` them or chain `.catch()`.
- `localStorage` key `plu_user` caches the session. `plu_nav_prefs` caches nav preferences. Do not read or write these keys from feature code — use the API.

---

## 2. Setup Requirements

Before `PlutoniumStore` will work, two properties **must** be set on the object:

| Property | Type | Required | Description |
|---|---|---|---|
| `WORKER_URL` | `string` | **Yes** | Base URL of the deployed Cloudflare Worker, no trailing slash |
| `GOOGLE_CLIENT_ID` | `string` | **Yes** (for sign-in) | OAuth 2.0 Client ID from Google Cloud Console (`*.apps.googleusercontent.com`) |

Set these as early as possible, before any other call:

```html
<script src="js/cloud-store.js"></script>
<script>
  PlutoniumStore.WORKER_URL       = 'https://plutonium-firebase-proxy.craftedgamz.workers.dev';
  PlutoniumStore.GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
</script>
```

If `WORKER_URL` is not set when any method is called, it throws synchronously:
```
[PlutoniumStore] WORKER_URL is not set.
```

---

## 3. Script Load Order

`cloud-store.js` must be loaded **before** any script that calls `PlutoniumStore`. It must be loaded **after** the `<body>` tag exists (it calls `_restoreSession()` on load which reads `localStorage`, but does not touch the DOM). The safe pattern is to load it in the `<body>` before your feature script:

```html
<body>
  <!-- ... page content ... -->

  <script src="js/particles.min.js"></script>
  <script src="js/cloud-store.js"></script>   <!-- ← before your script -->
  <script src="js/your-feature.js"></script>
  <script src="js/nav.js"></script>
  <script src="js/main.js"></script>
</body>
```

`nav.js` checks `typeof PlutoniumStore !== 'undefined'` defensively, so load order relative to nav is flexible, but loading `cloud-store.js` before `nav.js` is safest.

---

## 4. Configuration

### `PlutoniumStore.WORKER_URL` — `string` (read/write)

The base URL of the Cloudflare Worker proxy. Trailing slashes are stripped automatically.

```js
PlutoniumStore.WORKER_URL = 'https://plutonium-firebase-proxy.craftedgamz.workers.dev';
console.log(PlutoniumStore.WORKER_URL); // 'https://plutonium-firebase-proxy.craftedgamz.workers.dev'
```

### `PlutoniumStore.GOOGLE_CLIENT_ID` — `string` (read/write)

The Google OAuth 2.0 Client ID used to initiate the Google sign-in popup. Obtain this from the Google Cloud Console → APIs & Services → Credentials.

```js
PlutoniumStore.GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
```

---

## 5. Authentication API

### `PlutoniumStore.signIn()` → `Promise<User>`

Opens a Google account picker popup. On success, resolves with the `User` object and persists the session to `localStorage`. On failure, rejects with an `Error`.

```js
try {
  const user = await PlutoniumStore.signIn();
  console.log(user.displayName); // "Jane Smith"
} catch (e) {
  console.error('Sign-in failed:', e.message);
}
```

**Important:** This triggers a browser popup. Call it only from a direct user interaction (button click). Calling it on page load will be blocked by browsers.

---

### `PlutoniumStore.signOut()` → `Promise<void>`

Signs the user out, clears the session from `localStorage`, and fires all `onAuthChange` listeners with `null`.

```js
await PlutoniumStore.signOut();
```

---

### `PlutoniumStore.currentUser` — `User | null` (read-only getter)

Returns a **shallow copy** of the current user object, or `null` if not signed in. Safe to call synchronously at any time. Do not store the reference — re-read it when needed, as the underlying token refreshes.

```js
const user = PlutoniumStore.currentUser;
if (user) {
  console.log(user.uid);          // Firebase UID string (never changes for a user)
  console.log(user.displayName);  // "Jane Smith"
  console.log(user.email);        // "jane@example.com"
  console.log(user.photoUrl);     // Google profile photo URL or ''
  // user.idToken and user.refreshToken are present but should not be used directly
}
```

**`User` object shape:**

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Firebase user ID — use this as the stable user identifier |
| `displayName` | `string` | Google display name |
| `email` | `string` | Google account email |
| `photoUrl` | `string` | Profile photo URL, may be empty string |
| `idToken` | `string` | Firebase ID token — auto-refreshed, do not cache |
| `refreshToken` | `string` | Firebase refresh token — do not use directly |
| `expiresAt` | `number` | `Date.now()` timestamp when idToken expires |

---

### `PlutoniumStore.onAuthChange(callback)` → `() => void` (unsubscribe)

Registers a listener that fires whenever auth state changes (sign-in, sign-out, or session restore on page load). The callback fires **immediately once** with the current state, then on every future change.

Returns an unsubscribe function — call it to stop listening.

```js
const unsubscribe = PlutoniumStore.onAuthChange(user => {
  if (user) {
    // user is signed in — safe to call setDoc / getDoc / etc.
    showApp(user);
  } else {
    // user is signed out
    showSignInPrompt();
  }
});

// Later, if the component unmounts:
unsubscribe();
```

**When to use vs. `currentUser`:**
- Use `onAuthChange` when you need to reactively update UI or load data on auth state transitions.
- Use `currentUser` when you need a one-time synchronous check (e.g., inside an event handler that already knows the user is signed in).

---

## 6. Firestore API

Firestore stores **structured documents**. Use it for data that:
- Has named fields
- Needs to survive indefinitely
- Does not require sub-millisecond update latency

All documents are automatically stored at the Firestore path:
```
users/{uid}/{collection}
```
You only specify the `collection` segment (and optionally a sub-path). You never provide the UID — it is injected from the current session.

---

### `PlutoniumStore.setDoc(collection, data)` → `Promise<object>`

Creates or fully replaces a document. Uses Firestore's `PATCH` semantics — fields present in `data` are written; fields absent from `data` but existing in the document are **preserved** (Firestore PATCH merges at the top level by default via the REST API).

> **Note:** To replace all fields atomically, always include every field you want in the final document. To delete a specific field, you cannot use `setDoc` — you must re-write the document without that field or use Firestore field masks (not currently exposed).

```js
await PlutoniumStore.setDoc('settings', {
  theme:    'dark',
  volume:   0.8,
  language: 'en',
});
```

**Parameters:**
- `collection` — `string` — The collection/path within the user's namespace. See [Data Path Rules](#8-data-path-rules).
- `data` — `object` — Plain JS object. See [Supported Value Types](#9-supported-value-types).

**Returns:** The raw Firestore REST response object (rarely needed).

**Throws:** If not signed in, or if the network/Firestore call fails.

---

### `PlutoniumStore.getDoc(collection)` → `Promise<object | null>`

Reads a document. Returns the document as a plain JS object, or `null` if the document does not exist.

```js
const settings = await PlutoniumStore.getDoc('settings');
if (settings) {
  applyTheme(settings.theme);   // 'dark'
  setVolume(settings.volume);   // 0.8
} else {
  // First time — no settings saved yet
  applyDefaults();
}
```

**Returns:** Plain JS object with fields deserialized back to native JS types (strings, numbers, booleans, arrays, `Date` objects, nested objects, `null`). Returns `null` if the document doesn't exist (404).

**Throws:** If not signed in, or if the Firestore call fails for reasons other than 404.

---

### `PlutoniumStore.deleteDoc(collection)` → `Promise<void>`

Deletes a document. Silent success if the document doesn't exist.

```js
await PlutoniumStore.deleteDoc('scores');
```

**Throws:** If not signed in, or if the Firestore call fails.

---

## 7. Realtime Database API

The Realtime Database (RTDB) stores a **JSON tree**. Use it for data that:
- Changes frequently (presence, live counters, game state)
- Needs to be watched for changes (via polling)
- Is simple and flat in structure

All RTDB paths are automatically rooted at:
```
users/{uid}/{path}
```

---

### `PlutoniumStore.setRTDB(path, data)` → `Promise<any>`

**Replaces** the value at the given path entirely (HTTP `PUT`). Any existing children not present in `data` are deleted.

```js
await PlutoniumStore.setRTDB('presence', {
  online: true,
  lastSeen: Date.now(),
  page: 'games',
});
```

**Parameters:**
- `path` — `string` — Path within the user's namespace. Leading slashes are stripped. See [Data Path Rules](#8-data-path-rules).
- `data` — Any JSON-serializable value (object, array, string, number, boolean, `null`).

---

### `PlutoniumStore.updateRTDB(path, data)` → `Promise<any>`

**Merges** `data` into the existing node at `path` (HTTP `PATCH`). Only the keys present in `data` are written; other existing children are untouched. Equivalent to a shallow merge.

```js
// Only updates 'online' and 'lastSeen'; does not touch 'page'
await PlutoniumStore.updateRTDB('presence', {
  online:   false,
  lastSeen: Date.now(),
});
```

---

### `PlutoniumStore.getRTDB(path)` → `Promise<any>`

Reads the value at `path`. Returns the JSON value (object, array, primitive), or `null` if the path does not exist in the database.

```js
const presence = await PlutoniumStore.getRTDB('presence');
// presence is null if never written, otherwise the stored value
```

---

### `PlutoniumStore.deleteRTDB(path)` → `Promise<void>`

Deletes the node at `path` and all its children. Silent success if the path does not exist.

```js
await PlutoniumStore.deleteRTDB('presence');
```

---

### `PlutoniumStore.watchRTDB(path, callback, intervalMs?)` → `() => void`

Polls the RTDB path at a fixed interval and calls `callback` with the current value each time. Returns a `stop()` function — call it to cancel polling.

```js
const stopWatching = PlutoniumStore.watchRTDB(
  'presence',
  (data) => {
    updatePresenceUI(data);
  },
  3000  // poll every 3 seconds (default: 5000ms)
);

// When the component / page unloads:
stopWatching();
```

**Behavior:**
- The first poll fires immediately (synchronously starts, result arrives async).
- If the user is not signed in when a tick fires, the error is silently swallowed and the next tick is still scheduled.
- If `stop()` is called between the tick start and its response, the callback will not fire.

**When to use polling vs. Firestore:** Use `watchRTDB` for values that update frequently (presence, live scores). Use `getDoc` in a `setInterval` for Firestore if needed, but prefer RTDB for anything that changes more than once per minute.

---

## 8. Data Path Rules

### Firestore `collection` argument

- A simple collection name: `'settings'`, `'scores'`, `'inventory'`
- A sub-path (collection/document): `'game/highscores'`, `'prefs/ui'`
- **Do not** prefix with `/users/` or include the UID — this is injected automatically
- **Do not** use `.`, `#`, `$`, `[`, `]` in segment names (Firestore restriction)
- The resulting Firestore path will be: `users/{uid}/{collection}`

```js
// ✅ Correct
await PlutoniumStore.setDoc('settings', { ... });
await PlutoniumStore.setDoc('game/progress', { ... });

// ❌ Wrong — don't include uid or users/
await PlutoniumStore.setDoc(`users/${uid}/settings`, { ... });
```

### RTDB `path` argument

- A simple key: `'presence'`, `'counter'`
- A nested path: `'game/session'`, `'ui/theme'`
- Leading slashes are stripped automatically: `'/presence'` and `'presence'` are equivalent
- **Do not** include the UID
- The resulting RTDB path will be: `users/{uid}/{path}`

```js
// ✅ Correct
await PlutoniumStore.setRTDB('presence', { ... });
await PlutoniumStore.setRTDB('game/session', { ... });

// ✅ Also fine — leading slash stripped
await PlutoniumStore.setRTDB('/presence', { ... });

// ❌ Wrong
await PlutoniumStore.setRTDB(`users/${uid}/presence`, { ... });
```

### Reserved paths (already used by the system)

Do not use these collection/path names — they are managed by built-in Plutonium modules:

| Path | Used by | Storage |
|---|---|---|
| `nav_prefs` | `nav.js` — saves nav mode and collapsed state | Firestore |
| `plu_user` | `cloud-store.js` — session cache | `localStorage` only |
| `plu_nav_prefs` | `nav.js` — local fallback for nav prefs | `localStorage` only |

---

## 9. Supported Value Types

The Firestore serializer automatically converts between JS types and Firestore wire format. You never write Firestore field types manually.

| JavaScript value | Firestore wire type | Notes |
|---|---|---|
| `null` | `nullValue` | |
| `true` / `false` | `booleanValue` | |
| Integer number (`1`, `42`) | `integerValue` | Detected via `Number.isInteger()` |
| Float number (`1.5`, `3.14`) | `doubleValue` | |
| `string` | `stringValue` | |
| `Date` instance | `timestampValue` | Serialized as ISO 8601. Deserialized back to `Date`. |
| `Array` | `arrayValue` | Elements are recursively serialized |
| Plain `object` | `mapValue` | Keys/values are recursively serialized |
| `undefined` | `stringValue` (`"undefined"`) | Avoid — use `null` instead |

RTDB values are plain JSON — no special serialization. All standard JSON types work: `object`, `array`, `string`, `number`, `boolean`, `null`. `Date` objects must be converted to a number (`Date.now()`) or string (`new Date().toISOString()`) before writing to RTDB.

---

## 10. Error Handling

All async methods throw `Error` objects with a `[PlutoniumStore]` prefix in the message.

### Common error conditions

| Error message | Cause | Fix |
|---|---|---|
| `WORKER_URL is not set` | `PlutoniumStore.WORKER_URL` was not configured | Set it before any call |
| `Not signed in` | A data method was called without an active session | Call `signIn()` first, or gate behind `onAuthChange` |
| `Google OAuth Client ID not found` | `signIn()` called but `GOOGLE_CLIENT_ID` not set | Set `PlutoniumStore.GOOGLE_CLIENT_ID` |
| `Failed to fetch config (...)` | CF Worker unreachable or misconfigured | Check `WORKER_URL`, check Worker deployment |
| `setDoc failed: ...` | Firestore rejected the write | Usually a Security Rules violation — check Firebase console |
| `Token refresh failed` | Refresh token expired or revoked | User is auto-signed-out; `onAuthChange` fires with `null` |

### Recommended pattern

```js
async function saveGameScore(score) {
  try {
    await PlutoniumStore.setDoc('scores', { highScore: score, ts: new Date() });
  } catch (e) {
    if (e.message.includes('Not signed in')) {
      promptSignIn();
    } else {
      console.error('Failed to save score:', e);
    }
  }
}
```

---

## 11. Auth-Gate Pattern

Most features should not throw if the user is not signed in — they should degrade gracefully. The standard pattern is to check `currentUser` synchronously for immediate decisions, and use `onAuthChange` to react to sign-in/out.

### Pattern A — Load data on sign-in, clear on sign-out

Use this for any feature that shows personalized data.

```js
let stopWatcher = null;

PlutoniumStore.onAuthChange(async (user) => {
  if (user) {
    // Signed in — load saved state
    const data = await PlutoniumStore.getDoc('my_feature').catch(() => null);
    applyState(data || DEFAULT_STATE);

    // Optionally start a live watcher
    stopWatcher = PlutoniumStore.watchRTDB('my_feature/live', updateLiveUI, 4000);
  } else {
    // Signed out — revert to defaults
    applyState(DEFAULT_STATE);
    if (stopWatcher) { stopWatcher(); stopWatcher = null; }
  }
});
```

### Pattern B — Save on change, only if signed in

```js
function onUserChangedSetting(key, value) {
  settings[key] = value;
  applySettingToUI(key, value);

  // Fire-and-forget cloud save; silent if not signed in
  if (PlutoniumStore.currentUser) {
    PlutoniumStore.setDoc('my_feature_settings', settings).catch(console.warn);
  }
}
```

### Pattern C — Require sign-in before a specific action

```js
async function onClickPremiumFeature() {
  if (!PlutoniumStore.currentUser) {
    // Redirect to account page for sign-in, then return
    window.location.href = `account.html?return=${encodeURIComponent(location.pathname)}`;
    return;
  }
  // ... proceed with feature
}
```

---

## 12. Complete Feature Integration Example

Below is a complete, self-contained example for a hypothetical "scores" feature. Copy this pattern for any new feature.

```html
<!-- scores.html (body scripts) -->
<script src="js/cloud-store.js"></script>
<script>
  // ── 1. Configure ──────────────────────────────────────────────────────────
  PlutoniumStore.WORKER_URL       = 'https://plutonium-firebase-proxy.craftedgamz.workers.dev';
  PlutoniumStore.GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';

  // ── 2. State ──────────────────────────────────────────────────────────────
  const FEATURE_DOC  = 'scores';     // Firestore: users/{uid}/scores
  const LIVE_PATH    = 'scores/live'; // RTDB:      users/{uid}/scores/live

  let stopLiveWatch = null;

  // ── 3. React to auth state ────────────────────────────────────────────────
  PlutoniumStore.onAuthChange(async (user) => {
    if (user) {
      // Load saved high score from Firestore
      const doc = await PlutoniumStore.getDoc(FEATURE_DOC).catch(() => null);
      renderHighScore(doc?.highScore ?? 0);

      // Watch live session score from RTDB
      stopLiveWatch = PlutoniumStore.watchRTDB(LIVE_PATH, data => {
        renderLiveScore(data?.current ?? 0);
      }, 2000);

    } else {
      renderHighScore(0);
      renderLiveScore(0);
      if (stopLiveWatch) { stopLiveWatch(); stopLiveWatch = null; }
    }
  });

  // ── 4. Save data ──────────────────────────────────────────────────────────
  async function recordScore(score) {
    if (!PlutoniumStore.currentUser) return;

    // Update live RTDB score immediately
    await PlutoniumStore.updateRTDB(LIVE_PATH, {
      current: score,
      updatedAt: Date.now(),
    });

    // If it's a new high score, persist to Firestore
    const saved = await PlutoniumStore.getDoc(FEATURE_DOC).catch(() => null);
    if (!saved || score > saved.highScore) {
      await PlutoniumStore.setDoc(FEATURE_DOC, {
        highScore: score,
        achievedAt: new Date(),
      });
    }
  }
</script>
<script src="js/nav.js"></script>
<script src="js/main.js"></script>
```

---

## 13. Existing Usages in the Codebase

| File | What it stores | Path | Storage |
|---|---|---|---|
| `js/nav.js` | Nav layout mode (`dock`/`sidebar`/`topbar`) and collapsed state | `nav_prefs` | Firestore |
| `account.html` | Sign-in / sign-out UI; displays `currentUser` profile | — | Auth only |

When adding a new feature, choose a unique `collection`/`path` name. Check the table above and [Reserved paths](#reserved-paths-already-used-by-the-system) to avoid collisions.

---

## 14. Constraints and Limitations

| Constraint | Detail |
|---|---|
| **No anonymous data** | All data methods require a signed-in user. There is no anonymous/guest storage. |
| **No cross-user access** | All paths are scoped to `users/{uid}/`. A user cannot read or write another user's data. |
| **No collection listing** | There is no `listDocs()` or equivalent. You must know the document path ahead of time. |
| **No Firestore field delete** | Individual Firestore fields cannot be deleted via this API. Re-write the entire document without the field you want to remove. |
| **RTDB polling only** | Real-time push (SSE/WebSocket) is not available through the REST proxy. `watchRTDB` polls at an interval. For sub-second latency, the native Firebase SDK would be needed. |
| **Single Firestore database** | Only the `(default)` Firestore database is used. |
| **RTDB path must not contain `.json`** | The Worker appends `.json` to RTDB paths automatically. Do not include it in your path argument. |
| **Token auto-refresh** | The ID token expires after 1 hour. The module refreshes it automatically 5 minutes before expiry. Long-running pages (games, streams) will stay signed in. |
| **Session survives page reload** | The session is stored in `localStorage`. The user stays signed in across page navigations without re-prompting. |
| **Popup sign-in** | `signIn()` opens a Google popup. It must be called from a user gesture (click handler). It will not work if called on page load. |
| **WORKER_URL must be set first** | If any method is called before `WORKER_URL` is set, it throws synchronously. Always configure at the top of the page script. |
