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

      if (path === '/chat' && request.method === 'POST') {
        return handleChat(request, env, allowed);
      }

      if (path === '/models' && request.method === 'GET') {
        return handleModels(allowed);
      }

      if (path === '/ratelimit' && request.method === 'GET') {
        return handleRateLimit(request, env, allowed);
      }

      return corsResponse({ error: 'Not found' }, 404, allowed);
    } catch (err) {
      console.error('[groq-worker]', err);
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

// ── Models ────────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B',      speed: '280 t/s',  ctx: '131K' },
  { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B',       speed: '560 t/s',  ctx: '131K' },
  { id: 'openai/gpt-oss-120b',      label: 'GPT OSS 120B',       speed: '500 t/s',  ctx: '131K' },
  { id: 'openai/gpt-oss-20b',       label: 'GPT OSS 20B',        speed: '1000 t/s', ctx: '131K' },
  { id: 'qwen/qwen3.6-27b',         label: 'Qwen 3.6 27B',       speed: '500 t/s',  ctx: '131K' },
  { id: 'groq/compound',            label: 'Groq Compound',      speed: '450 t/s',  ctx: '131K' },
  { id: 'groq/compound-mini',       label: 'Groq Compound Mini', speed: '450 t/s',  ctx: '131K' },
];

function handleModels(allowed) {
  return corsResponse({ models: MODELS }, 200, allowed);
}

// ── Rate limiting (KV-based) ──────────────────────────────────────────────────
// 100 requests per 12-hour window, keyed per Firebase token prefix (per account).

const RL_MAX    = 100;
const RL_WINDOW = 60 * 60 * 12; // 12 hours in seconds

function getRateLimitKey(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return 'rl:' + auth.slice(7, 39);
  return 'rl:ip:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
}

async function checkRateLimit(env, key) {
  if (!env.GROQ_RATE_LIMIT) return { limited: false };

  const now    = Math.floor(Date.now() / 1000);
  const raw    = await env.GROQ_RATE_LIMIT.get(key);
  const bucket = raw ? JSON.parse(raw) : { count: 0, reset: now + RL_WINDOW };

  if (now >= bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + RL_WINDOW;
  }

  if (bucket.count >= RL_MAX) {
    return { limited: true, reset: bucket.reset };
  }

  bucket.count++;
  await env.GROQ_RATE_LIMIT.put(key, JSON.stringify(bucket), {
    expirationTtl: bucket.reset - now + 10,
  });

  return { limited: false, remaining: RL_MAX - bucket.count };
}

// ── Rate limit status (read-only) ────────────────────────────────────────────

async function handleRateLimit(request, env, allowed) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return corsResponse({ error: 'Unauthorized' }, 401, allowed);
  }

  if (!env.GROQ_RATE_LIMIT) {
    return corsResponse({ used: 0, remaining: RL_MAX, max: RL_MAX }, 200, allowed);
  }

  const key = getRateLimitKey(request);
  const now = Math.floor(Date.now() / 1000);
  const raw = await env.GROQ_RATE_LIMIT.get(key);
  const bucket = raw ? JSON.parse(raw) : { count: 0, reset: now + RL_WINDOW };

  const count = now >= bucket.reset ? 0 : bucket.count;
  return corsResponse({
    used:      count,
    remaining: RL_MAX - count,
    max:       RL_MAX,
    reset:     bucket.reset,
  }, 200, allowed);
}

// ── Chat ──────────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 100; // max messages accepted per request

async function handleChat(request, env, allowed) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return corsResponse({ error: 'Unauthorized' }, 401, allowed);
  }

  // BYOK: client supplied their own Groq key - skip rate limiting entirely
  const byokKey = request.headers.get('X-Groq-Key') || '';
  const groqKey = byokKey.startsWith('gsk_') ? byokKey : env.GROQ_API_KEY;

  if (!groqKey) {
    return corsResponse({ error: 'GROQ_API_KEY not configured' }, 500, allowed);
  }

  // Rate limit check - skipped for BYOK requests
  let remaining = null;
  if (!byokKey.startsWith('gsk_')) {
    const rlKey = getRateLimitKey(request);
    const rl = await checkRateLimit(env, rlKey);
    if (rl.limited) {
      const retryAfter = rl.reset ? Math.max(0, rl.reset - Math.floor(Date.now() / 1000)) : RL_WINDOW;
      return new Response(JSON.stringify({
        error: `Rate limit exceeded - you can send ${RL_MAX} messages every 12 hours.`,
        retry_after: retryAfter,
      }), {
        status: 429,
        headers: {
          ...corsHeaders(allowed, { 'Content-Type': 'application/json' }),
          'Retry-After': String(retryAfter),
        },
      });
    }
    remaining = rl.remaining ?? null;
  }

  const body = await request.json().catch(() => null);
  if (!body) return corsResponse({ error: 'Invalid JSON' }, 400, allowed);

  const { model, messages, system } = body;

  if (!model || !MODELS.find(m => m.id === model)) {
    return corsResponse({ error: 'Invalid or unsupported model' }, 400, allowed);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return corsResponse({ error: 'messages array required' }, 400, allowed);
  }

  // Build upstream messages array
  const upstream = [];
  if (system) upstream.push({ role: 'system', content: String(system).slice(0, 2000) });

  const sanitized = messages
    .slice(-MAX_MESSAGES)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 32000) }));

  upstream.push(...sanitized);

  const wantStream = request.headers.get('Accept') === 'text/event-stream';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages: upstream,
      temperature: 0.7,
      max_tokens:  4096,
      stream:      wantStream,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return corsResponse({ error: data.error?.message || 'Groq error' }, res.status, allowed);
  }

  if (wantStream) {
    // Pass the SSE stream straight through, injecting remaining as a final event
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
        // Send remaining count as a custom final event
        await writer.write(encoder.encode(`event: rl\ndata: ${JSON.stringify({ remaining: remaining ?? null })}\n\n`));
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: corsHeaders(allowed, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      }),
    });
  }

  const data = await res.json();
  return corsResponse({
    content:   data.choices?.[0]?.message?.content ?? '',
    model:     data.model,
    usage:     data.usage,
    remaining: remaining ?? null,
  }, 200, allowed);
}

// ── Homepage ──────────────────────────────────────────────────────────────────

function handleHomepage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium Groq Worker</title>
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
<h1 class="hero__title">Plutonium Groq Worker</h1>
<p class="hero__desc">Cloudflare Worker that proxies Groq chat completions - keeping the API key server-side.</p>

<div class="section">
<div class="section__heading">Endpoints</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>POST</code></td><td><code>/chat</code></td><td>Send messages, get a completion</td></tr>
<tr><td><code>GET</code></td><td><code>/models</code></td><td>List supported models</td></tr>
</tbody>
</table>
<p class="note">All requests require <code>Authorization: Bearer &lt;Firebase idToken&gt;</code>.<br>
Body: <code>{ model, messages: [{role, content}], system? }</code></p>
</div>

<div class="section">
<div class="section__heading">Required Secret</div>
<p class="note">Set via: <code>wrangler secret put GROQ_API_KEY</code></p>
</div>

</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
