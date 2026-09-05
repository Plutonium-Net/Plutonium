# Plutonium Network — `new/` build

A full browser-style web platform: Chrome-style tabs with a built-in secure browsing,
bookmarks & pins, plus the complete Plutonium Network feature set.

This build started as the **crafted gamz** browser project, rebranded to
**Plutonium Network**, with every feature backend replaced by Plutonium's own
services and the Plutonium-only features (cloud gaming, streaming, Stelena AI,
cloud-synced saves) added in.

## Pages

| Route (address bar) | File | What it is |
| --- | --- | --- |
| `pluto://games` | `js/workspaces.js` | Games — Local library + **Cloud** (Plutonium GCDN) with recently played & save sync |
| `pluto://media` | `js/workspaces.js` | Media — movies / TV / anime, age gate, Videasy & VidCore players |
| `pluto://ai` | `js/workspaces.js` | **Stelena** — Plutonium AI (Groq worker, streaming, voice + TTS) |
| `pluto://vms` | `js/workspaces.js` | Cloud VMs (remote sessions via the Plutonium VM worker) |
| `pluto://cloud` | `js/workspaces.js` | Cloud Gaming (cgapi worker: sessions, queue, WebRTC embed) |
| `pluto://account` | `pages/account.html` | Account — sign in/up, guest mode, bookmark/pin import & export |
| `pluto://about` | `pages/about.html` | About, credits & the Plutonium services list |

## Backends (all Plutonium's own)

| Service | Endpoint | Used by |
| --- | --- | --- |
| Accounts / Firestore gateway | `accounting.cdn.plutoniumnet.work` | `js/cloud-store.js` (auth, docs) |
| Games CDN | `g.cdn.plutoniumnet.work` | `js/games.js` (catalog, thumbnails, save sync) |
| AI (Groq gateway) | `ai.cdn.plutoniumnet.work/chat` | `js/ai.js` (Bearer idToken, SSE) |
| VMs (remote sessions) | `vm.cdn.plutoniumnet.work/session` | `js/vms.js` (Bearer idToken) |
| Cloud Gaming (cgapi) | `cgapi.cdn.plutoniumnet.work` | `js/cloud.js` (sessions / queue / embed) |
| Streaming | TMDB + Videasy / VidCore players | `js/stream.js` |

All worker calls that need it carry `Authorization: Bearer <Firebase idToken>`
from `PlutoniumStore` — the AI and VM pages gate on sign-in.

## Shared shell

`index.html` is the browser: chrome tabs (`js/chrome-tabs.js`), toolbar with
address bar & relay-switcher (`js/net.js`, `js/url.js`, `js/navigation.js`),
bookmarks bar (`js/bookmarks*.js`), home pins (`js/pins.js` — pinned games
and a VM quick-launch, added from the Games/VMs pages), keyboard shortcuts
(`js/keyboard.js`), panic/escape page (`js/escape.js`), loading screen
(`js/loading.js`) and a new-tab page with
the Plutonium logo, search and home pins (`js/main.js`).

Workspace views are injected into the single `index.html` document by
`js/workspaces.js`; `pluto://` URLs are resolved in `js/url.js`.

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
- Games recently played live under `plu_games_data` and sync to
  `games_data/saved`; per-game saves sync to `game_saves/{id}` via
  `plu_sync_*` postMessage messages.
- Ported Plutonium pages use `css/plu-tokens.css` (the Plutonium design
  tokens) so the old Plutonium look is preserved inside the tab.

## Remaining third-party dependencies (intentional)

- Relay servers: `wss://wisp-*.cgamz.online` (`js/net.js`) — shared infra the
  old Plutonium site itself used.

## PWA

The site is installable: `manifest.json` (with `img/icon-*.png` icons) plus
`js/pwa.js`, which registers the root `sw.js` so Chrome offers the install
prompt; Safari uses the manifest and `img/apple-touch-icon.png` via
"Add to Home Screen".

## Serving locally

```bash
npx http-server -p 8090 -a 127.0.0.1 -c-1
# then open http://127.0.0.1:8090/new/
```
