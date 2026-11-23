# Plutonium Clip extension

Records **only** the region Plutonium asks for — the game iframe or the proxied
page — with `tabCapture`. Chrome's screen-share picker never opens, because the
extension captures the tab it is already attached to and crops the frames it
receives.

## Install (unpacked, one time)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `extension` folder.
4. Reload the Plutonium tab.

Optional: pin the **Plutonium Clip** toolbar icon. Clicking it starts or stops a
clip for the current tab without touching the page UI.

## How it works

- `content.js` listens on the page's private `plutonium-clip` message channel.
- `background.js` calls `chrome.tabCapture.getMediaStreamId()` for that tab and
  hands the id to an offscreen document.
- `offscreen.js` opens the stream, crops it to the rectangle the page sent,
  records with `MediaRecorder`, and streams the result back in base64 chunks.
- `src/lib/clips/capture.ts` in the app reassembles the chunks, writes the clip
  into IndexedDB and shows it in the Clips studio.

## If recording will not start

Chrome sometimes requires a real invocation of the extension before tab capture
is allowed. Click the **Plutonium Clip** toolbar icon once for that tab; the
extension then records the same target the page would have used.

After reloading or updating the extension, reload Plutonium too. A tab that was
already open keeps the content script of the old extension instance, which Chrome
reports as “Extension context invalidated” — the page now says so and asks for
the reload, and clicking the toolbar icon also re-attaches the bridge.

## Permissions

- `tabCapture` — capture the tab's own frames.
- `offscreen` — run the recorder document.
- `storage` — remember which tab is mid-recording.
- Host access (`http://*/*`, `https://*/*`) so the bridge runs on any site that
  hosts Plutonium, including self-hosted and renamed deployments. Nothing is read
  from a page that does not speak the `plutonium-clip` channel.
