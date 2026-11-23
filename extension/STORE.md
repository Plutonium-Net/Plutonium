# Chrome Web Store submission

Everything the dashboard asks for, filled in and ready to paste.

## Upload

```bash
npm run pack:extension
```

Produces `dist/store/plutonium-clip-<version>.zip` containing `manifest.json` at the
root plus only runtime files (icons included). Upload that zip. Bump `version`
in `manifest.json` for every later upload; the store rejects a reused version.

## Listing

**Name**: Plutonium Clip

**Short description (≤132)**: Records only the Plutonium game or proxied tab.
No screen picker, no uploads, clips stay in your browser.

**Category**: Tools (alternate: Productivity)

**Language**: English

**Homepage**: https://plutoniumnet.work

**Detailed description**

> Plutonium Clip records gameplay and proxied pages without Chrome's screen
> picker.
>
> Open a game or browse through Plutonium's proxy and press the clip control in
> the game dock, the Lumin player bar or the tab bar. Recording starts, cropped to
> the game or page rectangle, and the next press stops it and saves the clip with no
> desktop, no other tabs, no address bar.
>
> - Press clip to start, press it again to stop and save
> - Records only the game or proxied page area
> - No screen-share picker, ever
> - Works with Plutonium-GCDN and LuminSDK games
> - Works on any domain where Plutonium is hosted, including self-hosted copies
> - Clips are stored locally in Plutonium's Clips studio
> - Trim, rename, favorite and download without an account
> - No microphone, no webcam, no audio capture
>
> Everything stays on your computer. The extension has no servers, no analytics
> and no remote code.
>
> Requires the Plutonium web app, which supplies the record controls inside the
> page.

**Single purpose statement**: Records the Plutonium game or proxied page area
into a local clip file on request.

## Permission justifications

- **tabCapture**: the recorder's entire function, capturing the current Plutonium
  tab's frames. Chrome shows a screen-share picker for `getDisplayMedia`, which
  this extension exists to avoid.
- **offscreen**: the recorder must run in a document that is not the visible
  page, so it can call `getUserMedia` on the tabCapture stream id, crop the
  frames and run `MediaRecorder`.
- **storage**: writes one tab id to `chrome.storage.session` so a finished clip
  can be relayed back to the right page; cleared when the tab stops recording.
- **No audio is recorded.** The recorder opens the tab stream video-only, so the
  game keeps its sound and nothing from the microphone or the tab is ever
  captured as audio.
- **activeTab**: grants capture for the tab the user invokes the extension on,
  which is also the toolbar-icon fallback path.
- **Host permission for `http://*/*` and `https://*/*`**: Plutonium is
  self-hosted by its users, so a deployment can live on any domain
  (plutoniumnet.work, a school or club host, a copied fork, a renamed origin).
  The bridge script therefore has to load on any site. It is passive: it waits
  on a private `postMessage` channel and answers only if the page is Plutonium,
  reads no page content, stores nothing and makes no network requests.
- **scripting**: adds the same bridge to a tab that was already open when the
  extension was installed, instead of forcing a reload.

### Reviewer note (paste in "Notes for the reviewer")

> Plutonium is an open web app for playing games and browsing through a proxy.
> Users run it on their own domains, so the extension cannot ship a fixed host
> list. `content.js` is a passive bridge: it listens for a message on the
> `plutonium-clip` window channel and replies only when the Plutonium app asks.
> On every other site it stays silent and reads nothing. Capturing is started by
> the page's own clip button (or the toolbar icon), never automatically, and the
> recorded frames are handed back to the Plutonium page to be stored in
> IndexedDB. No data leaves the machine. Test steps: open any Plutonium
> deployment, press a clip button in a game dock, the Lumin player bar or the tab
> bar while proxying, then open Clips.

## Data usage answers (Privacy practices tab)

- Does the item collect user data? **No.**
- Personally identifiable information: no
- Health information: no
- Financial and payment information: no
- Authentication information: no
- Personal communications: no
- Location: no
- Web history: no
- User activity: no
- Website content: no. Frames are processed in memory and handed to the
  Plutonium page for local storage; nothing is transmitted.
- Remote code: **no**. All scripts ship in the package.

Privacy policy URL: host `extension/PRIVACY.md` publicly (for example
`https://plutoniumnet.work/clip/privacy`) and paste that URL.

## Assets checklist

- Icon 128×128: already generated into `icons/icon128.png`.
- Screenshots: at least one, 1280×800 or 640×400 PNG/JPEG. Take them from the
  real app with the extension installed: a game with the clip control recording,
  the "Clip saved" toast, and the Clips studio with a clip open. Do not mock
  these up.
- Small promo tile 440×280 (optional).

## Pre-submit checks

- [ ] `npm run build:icons && npm run pack:extension`
- [ ] Load the zip's contents unpacked and record one GCDN game, one Lumin game
      and one proxied tab
- [ ] Confirm no screen-share picker appears in any of those three
- [ ] Confirm a second press stops the recording and the clip lands in Clips
- [ ] Confirm the clip contains only the game/page (no dock, tab bar or address
      bar)
- [ ] Confirm Plutonium hides clip controls until the extension is installed
- [ ] Load a Plutonium copy on a domain that is not plutoniumnet.work and
      confirm the clip buttons appear there (the first recording in a freshly
      loaded tab starts from the toolbar icon, as Chrome requires)
- [ ] Confirm the privacy policy URL resolves publicly
