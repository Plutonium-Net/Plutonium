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

      if (path === '/session' && request.method === 'DELETE') {
        return handleDelete(request, env, allowed);
      }

      if (path === '/sessions' && request.method === 'DELETE') {
        return handleDeleteAll(env, allowed);
      }

      return corsResponse({ error: 'Not found' }, 404, allowed);
    } catch (err) {
      console.error('[proxy-worker]', err);
      return corsResponse({ error: 'Internal error' }, 500, allowed);
    }
  },
};

// ── CORS ──────────────────────────────────────────────────────────────────────

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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── POST /session — create a kiosk Hyperbeam session ─────────────────────────
// Body: { url: "https://example.com" }
// Returns: { session_id, embed_url }
//
// Uses test mode (no API key billing) with:
//   - start_url set to the caller-supplied URL
//   - hide_toolbar: true  — hides browser chrome (borderless / kiosk)
//   - ublock: true        — built-in ad/tracker blocking

async function handleSession(request, env, allowed) {
  if (!env.HYPERBEAM_API_KEY) {
    return corsResponse({ error: 'HYPERBEAM_API_KEY not configured' }, 500, allowed);
  }

  const body = await request.json().catch(() => null);
  if (!body) return corsResponse({ error: 'Invalid JSON' }, 400, allowed);

  const { url } = body;
  if (!url || !isValidUrl(url)) {
    return corsResponse({ error: 'A valid url is required' }, 400, allowed);
  }

  const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}`,
    },
    body: JSON.stringify({
      start_url:    url,
      kiosk_mode:   true,
      ublock:       true,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return corsResponse({ error: data.message || 'Hyperbeam error' }, res.status, allowed);
  }

  return corsResponse({ session_id: data.session_id, embed_url: data.embed_url }, 200, allowed);
}

// ── DELETE /session — destroy a session ──────────────────────────────────────
// Body: { session_id: "…" }

async function handleDelete(request, env, allowed) {
  if (!env.HYPERBEAM_API_KEY) {
    return corsResponse({ error: 'HYPERBEAM_API_KEY not configured' }, 500, allowed);
  }

  const body = await request.json().catch(() => null);
  if (!body?.session_id) {
    return corsResponse({ error: 'session_id required' }, 400, allowed);
  }

  const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${body.session_id}`, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
  });

  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    return corsResponse({ error: data.message || 'Hyperbeam error' }, res.status, allowed);
  }

  return corsResponse({ deleted: true }, 200, allowed);
}

// ── DELETE /sessions — destroy ALL active sessions ────────────────────────────

async function handleDeleteAll(env, allowed) {
  if (!env.HYPERBEAM_API_KEY) {
    return corsResponse({ error: 'HYPERBEAM_API_KEY not configured' }, 500, allowed);
  }

  // Collect all session IDs across pages
  const ids = [];
  let cursor = null;
  do {
    const listUrl = 'https://engine.hyperbeam.com/v0/vm' + (cursor ? `?after=${cursor}` : '');
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });
    if (!listRes.ok) {
      const data = await listRes.json().catch(() => ({}));
      return corsResponse({ error: data.message || 'Failed to list sessions' }, listRes.status, allowed);
    }
    const body = await listRes.json().catch(() => ({}));
    const page = Array.isArray(body) ? body : (body.results || []);
    page.forEach(vm => ids.push(vm.id || vm.session_id));
    // paginate if there's a next cursor and it moved forward
    cursor = body.next && body.next !== cursor ? body.next : null;
  } while (cursor);

  const results = await Promise.all(ids.map(async id => {
    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });
    return { id, deleted: res.ok || res.status === 404 };
  }));

  return corsResponse({ deleted: results.length, sessions: results }, 200, allowed);
}

// ── Homepage ──────────────────────────────────────────────────────────────────

function handleHomepage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium Proxy Worker</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --pink: #e8175d; --bg: #000000; --text: #ffffff; --muted: #a0a0a0; }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", system-ui, sans-serif; line-height: 1.6; }
  .hero { min-height: 100vh; display: flex; align-items: flex-start; justify-content: flex-start; padding: 200px 0 0 16vw; }
  .hero__inner { max-width: 600px; }
  .hero__title { font-size: clamp(2.4rem, 5vw, 3.6rem); font-weight: 700; letter-spacing: -0.02em; color: var(--pink); line-height: 1.1; margin-bottom: 18px; }
  .hero__desc { font-size: clamp(1rem, 2vw, 1.15rem); color: var(--muted); max-width: 480px; line-height: 1.7; margin-bottom: 40px; }
  .section { margin-bottom: 48px; }
  .section__heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pink); margin-bottom: 16px; opacity: 0.8; }
  table { border-collapse: collapse; width: 100%; max-width: 560px; font-size: 0.88rem; }
  th, td { text-align: left; padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  th { color: var(--pink); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
  td { color: var(--muted); }
  td code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.82rem; color: var(--text); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
  .note { font-size: 0.82rem; color: var(--muted); margin-top: 14px; line-height: 1.6; }
  .note code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.78rem; color: var(--text); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 1px 6px; }
</style>
</head>
<body>
<div class="hero">
<div class="hero__inner">
<h1 class="hero__title">Plutonium Proxy Worker</h1>
<p class="hero__desc">Cloudflare Worker that spins up a borderless Hyperbeam kiosk session for a given URL — no auth required, API key stays server-side.</p>

<div class="section">
<div class="section__heading">Endpoints</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>POST</code></td><td><code>/session</code></td><td>Create a kiosk session. Body: <code>{ url }</code></td></tr>
<tr><td><code>DELETE</code></td><td><code>/session</code></td><td>Destroy a session. Body: <code>{ session_id }</code></td></tr>
</tbody>
</table>
<p class="note">No <code>Authorization</code> header required — open proxy, no rate limiting.<br>
Session flags: <code>hide_toolbar: true</code>, <code>ublock: true</code>.</p>
</div>

<div class="section">
<div class="section__heading">Required Secret</div>
<p class="note">Set via: <code>wrangler secret put HYPERBEAM_API_KEY</code></p>
</div>

</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
