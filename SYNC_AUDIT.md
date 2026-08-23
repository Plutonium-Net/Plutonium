# Plutonium Network — Cloud Sync Audit

> **Date:** August 22, 2026
> **Scope:** End-to-end review of every feature that persists user data to the cloud via `PlutoniumStore`, plus the client-side sync manager that orchestrates them.
> **Result:** 9 issues found, 9 fixed. One backend contract remains **unverified** (see [Open Question](#8-open-question-firestore-auth-contract)).

---

## 1. Executive Summary

Every user-facing feature that holds state — bookmarks, home pins, open tabs, theme/engine settings, games, personal uploads, and streaming watchlists — was audited against the cloud sync path (`PlutoniumStore` → accounting worker → Firebase Firestore).

The architecture is sound: a single per-user document namespace (`users/{uid}/…`), Firestore PATCH semantics for partial writes, and token-refresh handling in the store client. However, the audit surfaced a cluster of **data-loss and consistency bugs** concentrated in the sync manager and two feature pages:

| # | Severity | Issue | Fixed |
|---|----------|-------|-------|
| 1 | High | Signing in **dropped local-only bookmarks** (no union) | ✅ |
| 2 | High | **Pins never re-pushed** after import/clear — cleared pins resurrected on next sign-in | ✅ |
| 3 | Medium | **Failed pushes were never retried** (dedup hash set before the write) | ✅ |
| 4 | Medium | **Settings were advertised as synced but were not** (theme / proxy engine / wisp) | ✅ |
| 5 | Medium | **Wisp server choice was never persisted** across reloads | ✅ |
| 6 | Medium | Already-open tabs **didn't react to sign-in/sign-out** (no cross-frame propagation) | ✅ |
| 7 | Low | Bookmarks synced only on an 8s interval (no immediate trigger) | ✅ |
| 8 | Low | Account-page import/clear didn't re-render or push pins | ✅ |
| 9 | Medium | Streaming favourites & continue-watching **clobbered local-only data** on sign-in | ✅ |

No issues were found in games save-sync, personal-games file sync, tab snapshots, or the token-refresh path.

---

## 2. Architecture Overview

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Shell (index.html)          │        │  Feature iframes            │
│                              │        │  (games, stream, account,   │
│  account.js  ── sync manager │        │   personal-games, …)        │
│  bookmarks / pins / tabs     │        │                              │
│  settings (theme, proxy,     │        │  Each loads its own          │
│  wisp)                       │        │  cloud-store.js instance     │
└──────────────┬───────────────┘        └──────────────┬───────────────┘
               │                                       │
               └───────────────┬───────────────────────┘
                               ▼
                     ┌────────────────────┐
                     │   PlutoniumStore    │   (js/cloud-store.js)
                     │   (per-origin)      │
                     │  session + token    │
                     │  refresh + API      │
                     └─────────┬──────────┘
                               │  fetch: /config, /auth/*, /firestore/*, /rtdb/*
                               ▼
                    ┌──────────────────────┐
                    │ accounting worker     │  (cf-worker/firebase-proxy)
                    │ accounting.cdn.       │
                    │ plutoniumnet.work     │
                    └─────────┬────────────┘
                              ▼
                    ┌──────────────────────┐
                    │  Firebase            │
                    │  Auth + Firestore    │
                    │  (+ RTDB, unused)    │
                    └──────────────────────┘
```

### Key mechanics

- **Session:** signed-in user is persisted to `localStorage.plu_user` (id token + refresh token + expiry). A `storage` event listener keeps every same-origin frame in sync.
- **Token refresh:** `refreshIdToken()` exchanges the refresh token at `securetoken.googleapis.com` ~5 min before expiry; a scheduled timer covers long sessions.
- **Writes:** `setDoc(collection, data)` issues a Firestore `PATCH` on `/users/{uid}/{collection}` — partial-merge semantics, so feature docs that write different fields into one collection share it safely.
- **Reads:** `getDoc()` returns the decoded Firestore document (or `null` on 404).
- **Path model:** every feature owns a document path under `users/{uid}` — e.g. `bookmarks`, `pins`, `tabs`, `settings`, `games_data/saved`, `game_saves/{id}`, `personal_games/meta`, `pg_files/{id}`, `stream_favorites`, `stream_continue`, `stream_prefs`.

---

## 3. Sync Inventory

| Feature | Document path(s) | Local key | Push trigger | Pull trigger |
|---------|------------------|-----------|--------------|--------------|
| Bookmarks | `bookmarks` | `plu_bookmarks` | immediate (new) + 8s loop + sign-out | sign-in |
| Home pins | `pins` | `plu_pins` | pins.js save + 8s loop + sign-out | sign-in |
| Open tabs | `tabs` | `plu_tabs` | tab add/remove/switch/navigate + 8s loop + sign-out | sign-in |
| Settings | `settings` | `plu_theme`, `plu_proxy_engine`, `plu_wisp_server` | theme/engine/wisp change + 8s loop | sign-in |
| Games (GCDN) | `games_data/saved`, `game_saves/{id}` | `plu_games_data` | fav/recent/save change | sign-in |
| Personal games | `personal_games/meta`, `pg_files/{id}` | IndexedDB | add/edit/delete | sign-in |
| Streaming | `stream_favorites`, `stream_continue`, `stream_prefs` | in-memory caches | fav/progress/pref change | sign-in |

Auth-only (no doc sync): AI chat and VMs send `Authorization: Bearer <idToken>` to their workers.

---

## 4. Issues Found & Fixed

### 4.1 High — Bookmarks pull dropped local-only bookmarks
**File:** `js/account.js` · `pullBookmarks()`

The pull replaced local bookmarks with the cloud list, discarding anything a guest bookmarked before signing in. Pins already merged; bookmarks did not.

**Fix:** Union by `url` — cloud ordering wins, local-only bookmarks appended, and cached `data:` favicons preserved.

### 4.2 High — Pins changes outside pins.js never reached the cloud
**Files:** `js/account.js` · `js/account-page.js`

`_startSync()` pushed bookmarks and tabs only. The account page's import/clear wrote straight to `localStorage` with no push, so:
- imported/cleared pins never synced, and
- cleared pins were **resurrected** by the next sign-in pull.

**Fix:** Pins added to the periodic push loop; account-page import/clear now calls `scheduleLocalSync(type)` which re-renders the shell pin strip and schedules the push.

### 4.3 Medium — Failed pushes were never retried
**File:** `js/account.js` · `pushBookmarks()` / `pushTabs()`

The dedup hash was recorded *before* the `await setDoc`. On failure, subsequent pushes saw an unchanged hash and skipped — the data silently stopped syncing until it changed again.

**Fix:** Hash is now set only after a successful write.

### 4.4 Medium — Settings advertised as synced, but weren't
**File:** `js/account.js` (+ hooks in `js/theme-state.js`, `js/proxy.js`)

The sign-in overlay promised "sync your bookmarks, pins and **settings**", but no settings sync existed.

**Fix:** Added `pushSettings()` / `pullSettings()` syncing `plu_theme`, `plu_proxy_engine`, and `plu_wisp_server` to a Firestore `settings` doc. `saveThemeState()`, `setProxyEngine()`, and `switchWispServer()` each schedule a push; sign-in applies the pulled values. Pull is deferred ~2.5 s if `theme-state.js` / `proxy.js` haven't loaded yet.

### 4.5 Medium — Wisp server never persisted
**File:** `js/proxy.js`

The selected wisp region was memory-only; every reload re-ran geo/best-ping selection.

**Fix:** `switchWispServer()` now saves to `plu_wisp_server`, and `chooseBestWispServer()` prefers the saved choice. Verified: choosing Europe survives a full reload.

### 4.6 Medium — Open tabs ignored sign-in/sign-out
**File:** `js/cloud-store.js`

Each feature iframe runs its own store instance and only pulled cloud data when it *loaded*. Signing in on the shell left already-open games/stream tabs stale until reload.

**Fix:** Added a `storage` listener on `plu_user` — on a cross-frame sign-in/out every store re-syncs its session and fires `onAuthChange`, so open iframes pull immediately.

### 4.7 Low — Bookmarks synced on a timer only
**File:** `js/bookmarks.js` · `js/account.js`

Bookmark changes waited for the 8 s interval (or sign-out) to push.

**Fix:** `accountManager.scheduleBookmarkSync()` (debounced ~1.2 s) called from `Bookmarks.save()`, matching the pins pattern.

### 4.8 Low — Account page didn't re-render/push after import or clear
**File:** `js/account-page.js`

Import/clear mutated `localStorage` and re-rendered the bookmarks list, but the home-screen pins strip and the cloud push were left stale.

**Fix:** `scheduleLocalSync(type)` — re-renders shell pins, schedules the matching push (bookmarks or pins).

### 4.9 Medium — Streaming lists clobbered local-only data
**File:** `js/stream.js`

`loadFavorites()` / `loadContinueWatching()` replaced the local caches wholesale with the cloud copy.

**Fix:** Favourites union by id (cloud wins, local-only kept). Continue-watching merges per id with the **newest `ts` winning**, so progress made on another device isn't overwritten by a stale local entry.

---

## 5. Areas Audited — No Issues

These were reviewed end-to-end and found correct:

- **Games save-sync** (`js/games.js`): `game_saves/{id}` writes + `games_data/saved` (`savedGames` list) safely coexist because Firestore PATCH merges fields.
- **Personal games** (`js/personal-games.js`): meta list + per-game HTML files to `pg_files/{id}`, delete cleans the cloud file, GitHub imports carry source metadata for the SW fallback.
- **Tab snapshots** (`js/account.js`, `js/tabs.js`, `js/navigation.js`): add / remove / switch / navigate all schedule a push; pull restores through `restoreTabs()`.
- **Token lifecycle** (`js/cloud-store.js`): refresh scheduling, expired-token handling, sign-out cleanup.
- **Auth gating** (`js/ai.js`, `js/vms.js`): workers consume the live `idToken`; no stale-token risk in the chat/VM flows.

---

## 6. Verification Performed

Live testing on the running site (`http://127.0.0.1:8091`):

- All new sync APIs present on `window.accountManager` (`scheduleBookmarkSync`, `scheduleSettingsSync`, `pushSettings`, `pullSettings`, pins in the sync loop).
- Wisp selection persists — switched to **Europe**, hard-reloaded, and the switcher restored **Europe** from `plu_wisp_server`.
- Account-page `scheduleLocalSync('pins')` executes cleanly cross-frame (shell `renderPins` + pin push scheduled).
- Proxy engine persisted (`plu_proxy_engine`) and engine toggling intact (UV / Scramjet / Hyperbeam).
- `node --check` passes on every modified file: `account.js`, `bookmarks.js`, `account-page.js`, `cloud-store.js`, `theme-state.js`, `proxy.js`, `stream.js`.
- Console clean (only pre-existing iframe-sandbox warnings).

**Not testable from this environment:** an actual signed-in account against the live worker (network-isolated), so the write/read round-trip and cross-device merge were verified by code inspection + the Firestore REST contract rather than a live round-trip.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `js/account.js` | Bookmark union; pins in sync loop; dedup-after-success; `scheduleBookmarkSync`; `pushSettings`/`pullSettings` + settings in loop |
| `js/bookmarks.js` | `save()` schedules immediate bookmark sync |
| `js/account-page.js` | `scheduleLocalSync()` on import/clear (re-render + push) |
| `js/cloud-store.js` | `storage` listener for cross-frame session propagation |
| `js/theme-state.js` | `saveThemeState()` schedules settings sync |
| `js/proxy.js` | Wisp persistence (`plu_wisp_server`) + saved-server preference; engine/wisp schedule settings sync |
| `js/stream.js` | Favourites union; timestamp-aware continue-watching merge |

---

## 8. Open Question — Firestore Auth Contract

The client authenticates Firestore calls with `Authorization: Bearer <Firebase ID token>`. The `cf-worker/firebase-proxy/index.js` forwards that header **unchanged** to `firestore.googleapis.com`, which nominally expects a **Google OAuth 2.0 access token** rather than a Firebase ID token.

Two possibilities:

1. **It works** — the worker or Firebase project tolerates ID tokens (e.g. project config or API proxy behavior), matching the old site's behavior. Nothing to do.
2. **It fails in production** — every `setDoc`/`getDoc` returns 401, meaning *all* cloud sync silently breaks for real accounts.

**Recommended action:** create a throwaway account against the live worker and confirm a write/read round-trip succeeds. If it fails, the worker must exchange the ID token for a Google access token (or proxy through the Firebase SDK) before hitting Firestore. The client is already correct — this is a backend verification item, not a code defect found in the client.

---

## 9. Recommended Follow-ups

1. **Live round-trip test** — the single most valuable next step (see §8).
2. **Merge strategy hardening** — bookmarks/pins union by key; consider last-writer-wins timestamps for tabs to avoid stale-tab races across devices.
3. **Sync diagnostics** — surface per-feature sync status (last push/pull, last error) on the Account page; today failures are `console.warn` only.
4. **Periodic pull** — currently pulls happen on sign-in only; a periodic or on-focus pull would converge multi-device changes sooner.
