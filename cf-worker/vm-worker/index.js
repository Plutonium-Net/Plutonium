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

      if (path === '/stats' && request.method === 'GET') {
        return handleStats(env, allowed);
      }

      return corsResponse({ error: 'Not found' }, 404, allowed);
    } catch (err) {
      console.error('[vm-worker]', err);
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

// ── Rate limiting (KV-based) ──────────────────────────────────────────────────
// Stores a counter + expiry timestamp in KV under a per-user key.
// Limit: MAX_CREATES creates per WINDOW_SECS window.
// Gracefully no-ops if the KV binding is absent (e.g. wrangler dev without KV).

const MAX_CREATES  = 2;
const WINDOW_SECS  = 900; // 15 minutes

function getRateLimitKey(request) {
  // Key on the first 32 chars of the bearer token — unique per user,
  // and a forged token can only affect the forger's own bucket.
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return 'rl:' + auth.slice(7, 39);
  return 'rl:ip:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
}

async function checkRateLimit(env, key) {
  if (!env.VM_RATE_LIMIT) return { limited: false };

  const now     = Math.floor(Date.now() / 1000);
  const raw     = await env.VM_RATE_LIMIT.get(key);
  const bucket  = raw ? JSON.parse(raw) : { count: 0, reset: now + WINDOW_SECS };

  // Window expired — start fresh
  if (now >= bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + WINDOW_SECS;
  }

  if (bucket.count >= MAX_CREATES) {
    return { limited: true, reset: bucket.reset };
  }

  bucket.count++;
  // TTL: keep the key alive until the window ends (+ 10s buffer)
  await env.VM_RATE_LIMIT.put(key, JSON.stringify(bucket), {
    expirationTtl: bucket.reset - now + 10,
  });

  return { limited: false };
}

// ── Session handler ───────────────────────────────────────────────────────────

async function handleSession(request, env, allowed) {
  if (!env.HYPERBEAM_API_KEY) {
    return corsResponse({ error: 'HYPERBEAM_API_KEY not configured' }, 500, allowed);
  }

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return corsResponse({ error: 'Unauthorized' }, 401, allowed);
  }

  const body = await request.json().catch(() => ({}));
  const { action, session_id } = body;

  // ── Create ──────────────────────────────────────────────────────────────────
  if (action === 'create') {
    // Rate-limit only creates — deletes are always allowed
    const key = getRateLimitKey(request);
    const { limited, reset } = await checkRateLimit(env, key);
    if (limited) {
      const retryAfter = reset ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : WINDOW_SECS;
      return new Response(JSON.stringify({
        error: `Rate limit exceeded — you can start ${MAX_CREATES} sessions every 15 minutes.`,
        retry_after: retryAfter,
      }), {
        status: 429,
        headers: {
          ...corsHeaders(allowed, { 'Content-Type': 'application/json' }),
          'Retry-After': String(retryAfter),
        },
      });
    }

    const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}`,
      },
      body: JSON.stringify({
        offline_timeout: 60,
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

// ── Stats ─────────────────────────────────────────────────────────────────────

function handleStats(env, allowed) {
  return corsResponse({
    rate_limit: {
      max_creates:   2,
      window_secs:   900,
      window_label:  '15 minutes',
    },
    hyperbeam_configured: !!env.HYPERBEAM_API_KEY,
  }, 200, allowed);
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
  table { border-collapse: collapse; width: 100%; max-width: 520px; font-size: 0.88rem; }
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
<h1 class="hero__title">Plutonium VM Worker</h1>
<p class="hero__desc">Cloudflare Worker that proxies Hyperbeam VM session creation and deletion — keeping the API key server-side and enforcing per-user rate limits.</p>

<div class="section">
<div class="section__heading">Endpoints</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>POST</code></td><td><code>/session</code></td><td>Create or delete a Hyperbeam VM session</td></tr>
<tr><td><code>GET</code></td><td><code>/stats</code></td><td>Returns rate limit config and health info</td></tr>
</tbody>
</table>
<p class="note">All <code>/session</code> requests require <code>Authorization: Bearer &lt;Firebase idToken&gt;</code>.<br>
Body: <code>{ action: "create" }</code> or <code>{ action: "delete", session_id: "…" }</code>.</p>
</div>

<div class="section">
<div class="section__heading">Rate Limiting</div>
<table>
<thead><tr><th>Scope</th><th>Limit</th><th>Window</th></tr></thead>
<tbody>
<tr><td>Per user (create only)</td><td><code>2 sessions</code></td><td><code>15 minutes</code></td></tr>
</tbody>
</table>
<p class="note">Deletes are never rate-limited. Limits are keyed per Firebase token, falling back to IP.</p>
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
