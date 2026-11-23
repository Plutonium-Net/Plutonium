# Plutonium Clip — Privacy Policy

Last updated: 23 November 2026

Plutonium Clip records the Plutonium tab you are using while you have a clip
running: pressing clip starts the recording, pressing it again stops it and
saves the clip. Clips live in that tab's own browser storage. The extension does
not send anything anywhere.

## What the extension handles

- **Screen frames of the active Plutonium tab.** Captured only between your two
  presses of the clip button, and only for the rectangular area Plutonium asks
  for (the game frame or the proxied page). Recording stops the moment you press
  stop.
- **The recording's bytes.** Passed from the extension's offscreen recorder back
  to the Plutonium page, which stores them in IndexedDB on your computer.

## What the extension does not do

- No account, sign-in or identifier.
- No analytics, telemetry, advertising or tracking pixels.
- No network requests of its own: the extension contains no remote code and
  calls no servers.
- No microphone or camera access, and no audio in the recordings.
- No reading of page content anywhere: on a site that is not Plutonium the
  bridge script only waits for a message that never comes.
- No access to your history, downloads, clipboard or files.
- No sale or sharing of data with anyone.

## Storage

Clips live in the Plutonium page's IndexedDB (`plutonium-clips`). The extension
stores one number in `chrome.storage.session` — the id of the tab being
recorded — and clears it when the clip finishes or the tab closes. Uninstalling
the extension removes that value. Deleting clips in the Clips studio (or
clearing site data for Plutonium) removes the recordings.

## Permissions

- `tabCapture` — capture frames of the current tab without Chrome's screen-share
  picker.
- `offscreen` — run the recorder document that crops and encodes the frames.
- `storage` — remember which tab is recording for the length of one clip.
- `activeTab` — grant capture for the tab you invoke the extension on.
- `scripting` — adds the same page bridge to a tab that was already open when
  the extension was installed, so it does not need a reload.
- Host access to every website — Plutonium can be hosted on any domain, so the
  bridge script has to be able to load on any domain. It only speaks a private
  channel and does nothing at all on a page that is not Plutonium: no page
  content is read, stored or sent elsewhere, and it makes no network requests.

## Contact

Questions: open an issue on the Plutonium project or use the feedback panel in
the app.
