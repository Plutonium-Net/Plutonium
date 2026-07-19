export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const allowed = resolveAllowedOrigin(origin, env.ALLOWED_ORIGIN || '*');

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, allowed);
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' && request.method === 'GET') {
        return handleHomepage();
      }

      if (path === '/session' && request.method === 'POST') {
        return handleSession(request, env, allowed);
      }

      return corsResponse({ error: 'Not found' }, 404, allowed);
    } catch (err) {
      console.error('[vm-worker]', err);
      return corsResponse({ error: 'Internal error' }, 500, allowed);
    }
  },
};

// ── CORS ─────────────────────────────────────────────────────────────────────

function resolveAllowedOrigin(origin, setting) {
  if (!setting || setting === '*') return '*';
  const entries = setting.split(',').map(s => s.trim());
  for (const entry of entries) {
    if (entry === origin) return origin;
    if (entry.startsWith('*.')) {
      const base = entry.slice(2);
      if (origin === `https://${base}` || origin.endsWith(`.${base}`)) return origin;
    }
  }
  return entries[0];
}

function corsHeaders(allowed, extra = {}) {
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
    ...extra,
  };
}

function corsResponse(body, status, allowed) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: corsHeaders(allowed, { 'Content-Type': 'application/json' }),
  });
}

// ── Session handler ───────────────────────────────────────────────────────────

async function handleSession(request, env, allowed) {
  if (!env.HYPERBEAM_API_KEY) {
    return corsResponse({ error: 'HYPERBEAM_API_KEY not configured' }, 500, allowed);
  }

  // Require a Firebase ID token — we don't validate it cryptographically here,
  // but its presence ensures the browser sent one. For stronger validation,
  // add Firebase token verification via the REST API.
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return corsResponse({ error: 'Unauthorized' }, 401, allowed);
  }

  const body = await request.json().catch(() => ({}));
  const { action, session_id } = body;

  // ── Create ──────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}`,
      },
      body: JSON.stringify({
        offline_timeout: 60,            // auto-terminate 60s after last viewer leaves
        start_url: 'https://www.google.com',
      }),
    });

    const data = await res.json();
    if (!res.ok) return corsResponse({ error: data.message || 'Hyperbeam error' }, res.status, allowed);

    return corsResponse({ session_id: data.session_id, embed_url: data.embed_url }, 200, allowed);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!session_id) return corsResponse({ error: 'session_id required' }, 400, allowed);

    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${session_id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });

    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      return corsResponse({ error: data.message || 'Hyperbeam error' }, res.status, allowed);
    }

    return corsResponse({ deleted: true }, 200, allowed);
  }

  return corsResponse({ error: 'Unknown action' }, 400, allowed);
}

// ── Homepage ──────────────────────────────────────────────────────────────────

function handleHomepage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium VM Worker</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --pink: #e8175d; --bg: #000000; --text: #ffffff; --muted: #a0a0a0; }
  html, body { height: 100%; }
  body { background-color: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", system-ui, sans-serif; line-height: 1.6; }
  .hero { position: relative; z-index: 1; min-height: 100vh; display: flex; align-items: flex-start; justify-content: flex-start; padding: 200px 0 0 16vw; }
  .hero__inner { max-width: 600px; }
  .hero__title { font-size: clamp(2.4rem, 5vw, 3.6rem); font-weight: 700; letter-spacing: -0.02em; color: var(--pink); line-height: 1.1; margin-bottom: 18px; }
  .hero__desc { font-size: clamp(1rem, 2vw, 1.15rem); color: var(--muted); max-width: 480px; line-height: 1.7; margin-bottom: 40px; }
  .section { margin-bottom: 48px; }
  .section__heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pink); margin-bottom: 16px; opacity: 0.8; }
  table { border-collapse: collapse; width: 100%; max-width: 480px; font-size: 0.88rem; }
  th, td { text-align: left; padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  th { color: var(--pink); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
  td { color: var(--muted); }
  td code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.82rem; color: var(--text); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
  .section__note { font-size: 0.82rem; color: var(--muted); margin-top: 14px; }
  .section__note code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.78rem; color: var(--text); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
</style>
</head>
<body>
<div class="hero">
<div class="hero__inner">
<h1 class="hero__title">Plutonium VM Worker</h1>
<p class="hero__desc">Cloudflare Worker that proxies Hyperbeam VM session creation and deletion — keeping the API key server-side.</p>
<div class="section">
<div class="section__heading">Endpoints</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>POST</code></td><td><code>/session</code></td><td>Create or delete a Hyperbeam VM session</td></tr>
</tbody>
</table>
<p class="section__note">All requests require <code>Authorization: Bearer &lt;Firebase idToken&gt;</code>.<br>Body: <code>{ action: "create" }</code> or <code>{ action: "delete", session_id: "…" }</code>.</p>
</div>
<div class="section">
<div class="section__heading">Required Secret</div>
<p class="section__note">Set via: <code>wrangler secret put HYPERBEAM_API_KEY</code></p>
</div>
</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
