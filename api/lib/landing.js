/**
 * The API index page. Replaces the four near-identical landing pages that each
 * worker served at its own root.
 */

const GROUPS = [
  {
    heading: 'Firebase',
    rows: [
      ['GET',    '/config',            'Sanitised Firebase client config'],
      ['POST',   '/auth/email',        'Sign in with email & password'],
      ['POST',   '/auth/signup',       'Create an email account'],
      ['POST',   '/auth/reset',        'Send a password-reset email'],
      ['POST',   '/auth/update',       'Update the display name'],
      ['POST',   '/auth/password',     'Change the password'],
      ['POST',   '/auth/providers',    'List linked providers'],
      ['POST',   '/auth/link',         'Link a provider'],
      ['POST',   '/auth/unlink',       'Unlink a provider'],
      ['POST',   '/auth/delete',       'Purge cloud data, then delete the account'],
      ['GET',    '/auth/oauth/start',  'Redirect to GitHub or Google OAuth'],
      ['GET',    '/auth/oauth/callback', 'Exchange the code for a Firebase token'],
      ['*',      '/firestore/…',       'Firestore REST gateway'],
      ['*',      '/rtdb/…',            'Realtime Database REST gateway'],
    ],
  },
  {
    heading: 'AI',
    rows: [
      ['POST',   '/ai/chat',           'Chat completion, streaming on Accept: text/event-stream'],
      ['POST',   '/ai/tts',            'Orpheus text-to-speech'],
      ['POST',   '/ai/transcribe',     'Whisper transcription'],
      ['GET',    '/ai/models',         'Supported models'],
      ['GET',    '/ai/ratelimit',      'Current quota window for the caller'],
    ],
  },
  {
    heading: 'Remote sessions',
    rows: [
      ['POST',   '/vm/session',        'Create or delete a full VM session'],
      ['GET',    '/vm/stats',          'VM rate-limit config'],
      ['POST',   '/net/session',       'Create a kiosk browser session'],
      ['DELETE', '/net/session',       'Destroy one kiosk session'],
      ['DELETE', '/net/sessions',      'Destroy every kiosk session'],
    ],
  },
];

export function landingPage() {
  const sections = GROUPS.map(group => `
<div class="section">
  <div class="section__heading">${group.heading}</div>
  <table>
    <tbody>
      ${group.rows.map(([method, route, description]) => `<tr>
        <td class="method">${method}</td>
        <td><code>${route}</code></td>
        <td class="desc">${description}</td>
      </tr>`).join('\n      ')}
    </tbody>
  </table>
</div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium API</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --pink: #e8175d; --bg: #000000; --text: #ffffff; --muted: #a0a0a0; }
  body { background-color: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", system-ui, sans-serif; line-height: 1.6; }
  .hero { min-height: 100vh; display: flex; align-items: flex-start; justify-content: flex-start; padding: 160px 0 120px 16vw; }
  .hero__inner { max-width: 680px; }
  .hero__title { font-size: clamp(2.4rem, 5vw, 3.6rem); font-weight: 700; letter-spacing: -0.02em; color: var(--pink); line-height: 1.1; margin-bottom: 18px; }
  .hero__desc { font-size: clamp(1rem, 2vw, 1.15rem); color: var(--muted); max-width: 520px; line-height: 1.7; margin-bottom: 40px; }
  .section { margin-bottom: 40px; }
  .section__heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pink); margin-bottom: 14px; opacity: 0.8; }
  table { border-collapse: collapse; width: 100%; max-width: 640px; font-size: 0.88rem; }
  td { text-align: left; padding: 7px 12px 7px 0; border-bottom: 1px solid rgba(255,255,255,0.07); vertical-align: top; }
  td.method { color: var(--pink); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; width: 74px; white-space: nowrap; }
  td.desc { color: var(--muted); }
  code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.82rem; color: var(--text); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
  .note { font-size: 0.82rem; color: var(--muted); margin-top: 16px; max-width: 560px; line-height: 1.7; }
</style>
</head>
<body>
<div class="hero">
<div class="hero__inner">
  <h1 class="hero__title">Plutonium API</h1>
  <p class="hero__desc">One Worker serving Firebase, AI and remote sessions for Plutonium Network. Provider keys stay server-side; AI and VM routes require a Firebase ID token.</p>
  ${sections}
  <p class="note">Rate limits apply per verified account: 100 AI messages every 12 hours, 2 VM sessions every 15 minutes. Browser sessions under <code>/net</code> are unauthenticated and unlimited.</p>
</div>
</div>
</body>
</html>`;
}
