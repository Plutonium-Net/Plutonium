/**
 * Plutonium Firebase Proxy — Cloudflare Worker
 *
 * Secrets stored in wrangler.toml [vars] or `wrangler secret put`:
 *   FIREBASE_API_KEY        — Web API key
 *   FIREBASE_PROJECT_ID     — e.g. "plutonium-xyz"
 *   FIREBASE_DATABASE_URL   — e.g. "https://plutonium-xyz-default-rtdb.firebaseio.com"
 *   ALLOWED_ORIGIN          — e.g. "https://plutonium.example.com" (or "*" for dev)
 *
 * Routes exposed to the browser:
 *   GET  /config              → returns non-secret Firebase client config
 *   POST /auth/token          → exchanges a Google ID token for a Firebase ID token
 *   *    /firestore/*         → proxies Firestore REST API
 *   *    /rtdb/*              → proxies Realtime Database REST API
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';

    // ── CORS pre-flight ──────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, allowed);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/config' && request.method === 'GET') {
        return handleConfig(env, allowed);
      }

      if (path === '/auth/token' && request.method === 'POST') {
        return handleAuthToken(request, env, allowed);
      }

      if (path.startsWith('/firestore/')) {
        return handleFirestore(request, env, allowed, path);
      }

      if (path.startsWith('/rtdb/')) {
        return handleRTDB(request, env, allowed, path, url);
      }

      return corsResponse({ error: 'Not found' }, 404, allowed);
    } catch (err) {
      console.error('[firebase-proxy]', err);
      return corsResponse({ error: 'Internal error' }, 500, allowed);
    }
  },
};

/* ── /config ─────────────────────────────────────────────────────────────── */
function handleConfig(env, allowed) {
  // The apiKey is safe to expose — it only identifies your project.
  // Auth is enforced by Firebase Security Rules, not by hiding the key.
  const config = {
    apiKey:            env.FIREBASE_API_KEY,
    projectId:         env.FIREBASE_PROJECT_ID,
    databaseURL:       env.FIREBASE_DATABASE_URL,
    // authDomain is always <projectId>.firebaseapp.com
    authDomain:        `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    storageBucket:     `${env.FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             env.FIREBASE_APP_ID || '',
  };
  return corsResponse(config, 200, allowed);
}

/* ── /auth/token — exchange Google credential for Firebase ID token ───────── */
async function handleAuthToken(request, env, allowed) {
  const { idToken } = await request.json();
  if (!idToken) return corsResponse({ error: 'idToken required' }, 400, allowed);

  // Exchange via Firebase Auth REST — signInWithIdp
  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody:          `id_token=${idToken}&providerId=google.com`,
        requestUri:        'http://localhost',
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);

  // Only forward the fields the client needs
  return corsResponse({
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    localId:      data.localId,
    displayName:  data.displayName,
    email:        data.email,
    photoUrl:     data.photoUrl,
  }, 200, allowed);
}

/* ── /firestore/* ─────────────────────────────────────────────────────────── */
async function handleFirestore(request, env, allowed, path) {
  // Strip "/firestore" prefix — the rest is the Firestore REST path
  const firestorePath = path.replace(/^\/firestore/, '');
  const upstream = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${firestorePath}`;

  const upstreamReq = buildUpstreamRequest(request, upstream);
  const resp = await fetch(upstreamReq);
  return proxiedResponse(resp, allowed);
}

/* ── /rtdb/* ──────────────────────────────────────────────────────────────── */
async function handleRTDB(request, env, allowed, path, originalUrl) {
  // Strip "/rtdb" prefix — the rest becomes the RTDB path + .json
  const rtdbPath = path.replace(/^\/rtdb/, '');
  // Preserve query params (e.g. ?orderBy, ?limitToFirst, etc.)
  const qs = originalUrl.search || '';
  const upstream = `${env.FIREBASE_DATABASE_URL}${rtdbPath}.json${qs}`;

  const upstreamReq = buildUpstreamRequest(request, upstream);
  const resp = await fetch(upstreamReq);
  return proxiedResponse(resp, allowed);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function buildUpstreamRequest(original, upstreamUrl) {
  // Forward the Authorization header so Firebase Security Rules apply
  const headers = new Headers();
  const auth = original.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  headers.set('Content-Type', 'application/json');

  return new Request(upstreamUrl, {
    method:  original.method,
    headers,
    body:    ['GET', 'HEAD'].includes(original.method) ? undefined : original.body,
  });
}

async function proxiedResponse(upstreamResp, allowed) {
  const body = await upstreamResp.text();
  return new Response(body, {
    status:  upstreamResp.status,
    headers: corsHeaders(allowed, { 'Content-Type': 'application/json' }),
  });
}

function corsResponse(body, status, allowed) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: corsHeaders(allowed, { 'Content-Type': 'application/json' }),
  });
}

function corsHeaders(allowed, extra = {}) {
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
    ...extra,
  };
}
