# Plutonium Network — `new/` build

A full browser-style web platform: Chrome-style tabs with a built-in web proxy,
bookmarks & pins, plus the complete Plutonium Network feature set.

This build started as the **crafted gamz** browser project, rebranded to
**Plutonium Network**, with every feature backend replaced by Plutonium's own
services and the Plutonium-only features (cloud gaming, streaming, Stelena AI,
cloud-synced saves) added in.

## Pages

| Route (address bar) | File | What it is |
| --- | --- | --- |
| `pluto://games` | `pages/games.html` | Games — Local library + **Cloud** (Plutonium GCDN) with favourites, recently played & save sync |
| `pluto://movies` / `pluto://stream` | `pages/stream.html` | Streaming — movies / TV / anime, age gate, Videasy & VidCore players |
| `pluto://ai` | `pages/ai.html` | **Stelena** — Plutonium AI (Groq worker, streaming, voice + TTS) |
| `pluto://vms` | `pages/vms.html` | Cloud VMs (Hyperbeam via the Plutonium VM worker) |
| `pluto://cloud` | `pages/cloud.html` | Cloud Gaming (cgapi worker: sessions, queue, WebRTC embed) |
| `pluto://account` | `pages/account.html` | Account — sign in/up, guest mode, bookmark/pin import & export |
| `pluto://about` | `pages/about.html` | About, credits & the Plutonium services list |

## Backends (all Plutonium's own)

| Service | Endpoint | Used by |
| --- | --- | --- |
| Accounts / Firestore proxy | `accounting.cdn.plutoniumnet.work` | `js/cloud-store.js` (auth, docs) |
| Games CDN | `g.cdn.plutoniumnet.work` | `pages/games.html` (catalog, thumbnails, save sync) |
| AI (Groq proxy) | `ai.cdn.plutoniumnet.work/chat` | `pages/ai.html` (Bearer idToken, SSE) |
| VMs (Hyperbeam proxy) | `vm.cdn.plutoniumnet.work/session` | `pages/vms.html` (Bearer idToken) |
| Cloud Gaming (cgapi) | `cgapi.cdn.plutoniumnet.work` | `pages/cloud.html` (sessions / queue / embed) |
| Streaming | TMDB + Videasy / VidCore players | `pages/stream.html` |

All worker calls that need it carry `Authorization: Bearer <Firebase idToken>`
from `PlutoniumStore` — the AI and VM pages gate on sign-in.

## Shared shell

`index.html` is the browser: chrome tabs (`js/chrome-tabs.js`), toolbar with
address bar & wisp-switcher (`js/proxy.js`, `js/url.js`, `js/navigation.js`),
bookmarks bar (`js/bookmarks*.js`), home pins (`js/pins.js` — pinned games
and a VM quick-launch, added from the Games/VMs pages), keyboard shortcuts
(`js/keyboard.js`), panic/escape page (`js/escape.js`), loading screen
(`js/loading.js`) and a new-tab page with
the Plutonium logo, search and home pins (`js/main.js`).

Local pages are opened in the tab iframe via `pluto://` URLs resolved in
`js/url.js` (`LOCAL_PAGES`).

## Theming & data

- `js/theme-state.js` reads/writes `plu_theme` + `plu_settings`
  (one-time migration from the old `cg_theme` / `cg_settings` keys).
  Default accent is Plutonium pink `#e8175d`.
- **Backgrounds** — `bg.html` + `js/bg.js` run the Plutonium background
  engine (`bg/js/bg-init.js` + particles.js / Vanta.js): 13 animated effects
  (particles, birds, fog, waves, clouds, globe, net, trunk, topology, dots,
  rings, halo, none) tinted by the accent color, selected via the
  `bgEffect` setting (mirrored to `plu_settings.bgStyle` for old-key
  compatibility).
- `js/account.js` — `window.accountManager` (PlutoniumStore-backed):
  email/password + OAuth, bookmarks/pins/tabs cloud sync under
  `bookmarks`, `pins`, `tabs` docs, with one-time migration of the old
  `cg_bookmarks` / `cg_pins` / `cg_tabs` keys.
- Games favourites/recently played live under `plu_games_data` and sync to
  `games_data/saved`; per-game saves sync to `game_saves/{id}` via
  `plu_sync_*` postMessage messages.
- Ported Plutonium pages use `css/plu-tokens.css` (the Plutonium design
  tokens) so the old Plutonium look is preserved inside the tab.

## Remaining third-party dependencies (intentional)

- Wisp servers: `wss://wisp-*.cgamz.online` (`js/proxy.js`) — shared infra the
  old Plutonium site itself used.

## Serving locally

```bash
npx http-server -p 8090 -a 127.0.0.1 -c-1
# then open http://127.0.0.1:8090/new/
```
