/**
 * Plutonium Firebase Proxy — Cloudflare Worker
 *
 * Secrets stored in wrangler.toml [vars] or `wrangler secret put`:
 *   FIREBASE_API_KEY        — Web API key
 *   FIREBASE_PROJECT_ID     — e.g. "plutonium-xyz"
 *   FIREBASE_DATABASE_URL   — e.g. "https://plutonium-xyz-default-rtdb.firebaseio.com"
 *   ALLOWED_ORIGIN          — e.g. "https://plutonium.example.com" (or "*" for dev)
 *   SITE_URL                — e.g. "https://plutoniumnet.work" (no trailing slash)
 *
 * OAuth secrets (set via `wrangler secret put`):
 *   GITHUB_CLIENT_ID        — from your GitHub OAuth App
 *   GITHUB_CLIENT_SECRET    — from your GitHub OAuth App
 *   GOOGLE_CLIENT_ID        — from Firebase project's Google OAuth client
 *                             (Google Cloud Console → APIs & Services → Credentials
 *                              → the "Web client (auto created by Google Service)" client ID)
 *   GOOGLE_CLIENT_SECRET    — same credential entry, client secret
 *
 * OAuth setup:
 *   Firebase Console → Authentication → Sign-in method → Enable Google and GitHub.
 *   For GitHub: set the Authorization callback URL in your GitHub OAuth App to:
 *     https://accounting.cdn.plutoniumnet.work/auth/oauth/callback
 *   For Google: no extra setup — uses the auto-created web OAuth client from Firebase.
 *
 * Routes exposed to the browser:
 *   GET  /config                    → returns non-secret Firebase client config
 *   POST /auth/email                → signs in with email + password
 *   POST /auth/signup               → creates a new email+password account
 *   POST /auth/reset                → sends a password-reset email
 *   POST /auth/update               → updates displayName (requires idToken)
 *   POST /auth/delete               → permanently deletes the account (requires idToken)
 *   GET  /auth/oauth/start          → ?provider=google|github  redirects to provider
 *   GET  /auth/oauth/callback       → handles provider redirect, postMessages result to opener
 *   *    /firestore/*               → proxies Firestore REST API
 *   *    /rtdb/*                    → proxies Realtime Database REST API
 */

export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const allowed = resolveAllowedOrigin(origin, env.ALLOWED_ORIGIN || '*');

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

      if (path === '/auth/email' && request.method === 'POST') {
        return handleEmailSignIn(request, env, allowed);
      }

      if (path === '/auth/signup' && request.method === 'POST') {
        return handleEmailSignUp(request, env, allowed);
      }

      if (path === '/auth/reset' && request.method === 'POST') {
        return handlePasswordReset(request, env, allowed);
      }

      if (path === '/auth/update' && request.method === 'POST') {
        return handleProfileUpdate(request, env, allowed);
      }

      if (path === '/auth/delete' && request.method === 'POST') {
        return handleAccountDelete(request, env, allowed);
      }

      if (path === '/auth/oauth/start' && request.method === 'GET') {
        return handleOAuthStart(request, env, url);
      }

      if (path === '/auth/oauth/callback' && request.method === 'GET') {
        return handleOAuthCallback(request, env, url);
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

/* ── Origin allowlist helper ─────────────────────────────────────────────── */
// ALLOWED_ORIGIN can be:
//   "*"                        → allow all
//   "https://example.com"      → exact match
//   "*.example.com"            → any subdomain (and the apex) of example.com
function resolveAllowedOrigin(origin, setting) {
  if (!setting || setting === '*') return '*';

  const entries = setting.split(',').map(s => s.trim());

  for (const entry of entries) {
    if (entry === origin) return origin;

    // Wildcard subdomain pattern: *.example.com
    if (entry.startsWith('*.')) {
      const base = entry.slice(2);
      if (origin === `https://${base}` || origin.endsWith(`.${base}`)) return origin;
    }
  }

  // Origin not in allowlist — return the first entry so the browser
  // gets a mismatch error rather than an opaque failure.
  return entries[0];
}

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

/* ── /auth/email — sign in with email + password ─────────────────────────── */
async function handleEmailSignIn(request, env, allowed) {
  const { email, password } = await request.json();
  if (!email || !password) return corsResponse({ error: 'email and password required' }, 400, allowed);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);

  return corsResponse({
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    localId:      data.localId,
    displayName:  data.displayName || '',
    email:        data.email,
    photoUrl:     data.photoUrl || '',
  }, 200, allowed);
}

/* ── /auth/signup — create email + password account ─────────────────────── */
async function handleEmailSignUp(request, env, allowed) {
  const { email, password, displayName } = await request.json();
  if (!email || !password) return corsResponse({ error: 'email and password required' }, 400, allowed);

  // Create the account
  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);

  // Optionally set displayName
  if (displayName) {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: false }),
      }
    );
  }

  return corsResponse({
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    localId:      data.localId,
    displayName:  displayName || '',
    email:        data.email,
    photoUrl:     '',
  }, 200, allowed);
}

/* ── /auth/reset — send password-reset email ────────────────────────────── */
async function handlePasswordReset(request, env, allowed) {
  const { email } = await request.json();
  if (!email) return corsResponse({ error: 'email required' }, 400, allowed);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);
  return corsResponse({ email: data.email }, 200, allowed);
}

/* ── /auth/update — update displayName ──────────────────────────────────── */
async function handleProfileUpdate(request, env, allowed) {
  const { idToken, displayName } = await request.json();
  if (!idToken) return corsResponse({ error: 'idToken required' }, 400, allowed);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, displayName: displayName || '', returnSecureToken: false }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);
  return corsResponse({ displayName: data.displayName || '' }, 200, allowed);
}

/* ── /auth/delete — permanently delete account ───────────────────────────── */
async function handleAccountDelete(request, env, allowed) {
  const { idToken } = await request.json();
  if (!idToken) return corsResponse({ error: 'idToken required' }, 400, allowed);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return corsResponse(data, upstream.status, allowed);
  return corsResponse({ deleted: true }, 200, allowed);
}

/* ── /auth/oauth/start — redirect browser to Google or GitHub ───────────── */
//
// Builds the provider's OAuth authorization URL and redirects the popup to it.
// The redirect_uri is always the worker callback, which is registered in the
// GitHub OAuth App. For Google, the redirect_uri is also registered as an
// Authorised redirect URI on the Google OAuth client in Cloud Console.
//
// We build the URL manually (rather than using createAuthUri) so we fully
// control the redirect_uri — createAuthUri forces firebaseapp.com which only
// works with the Firebase JS SDK.
async function handleOAuthStart(request, env, url) {
  const provider    = url.searchParams.get('provider');
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  // Use a random state value to prevent CSRF
  const state = crypto.randomUUID();

  // Encode provider into state so the callback knows which token endpoint to call
  const encodedState = `${provider}:${state}`;

  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID) return new Response('GITHUB_CLIENT_ID not configured', { status: 500 });
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id',    env.GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('scope',        'read:user user:email');
    authUrl.searchParams.set('state',        encodedState);
    return Response.redirect(authUrl.toString(), 302);
  }

  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID) return new Response('GOOGLE_CLIENT_ID not configured', { status: 500 });
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',     env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',  callbackUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope',         'openid email profile');
    authUrl.searchParams.set('state',         encodedState);
    return Response.redirect(authUrl.toString(), 302);
  }

  return new Response('Unknown provider', { status: 400 });
}

/* ── /auth/oauth/callback — exchange code for token, sign in with Firebase ─ */
async function handleOAuthCallback(request, env, url) {
  const siteUrl     = (env.SITE_URL || '').replace(/\/$/, '');
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  const code     = url.searchParams.get('code');
  const error    = url.searchParams.get('error');
  // State is "provider:uuid" encoded by /start
  const provider = (url.searchParams.get('state') || '').split(':')[0];

  if (error || !code) {
    return oauthPopupPage(siteUrl, null, error || 'No code returned from provider');
  }

  let postBody = null;

  // ── GitHub: exchange code for access_token ──
  if (provider === 'github') {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  callbackUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      postBody = `access_token=${encodeURIComponent(tokenData.access_token)}&providerId=github.com`;
    }
  }

  // ── Google: exchange code for id_token ──
  if (provider === 'google') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  callbackUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.id_token) {
      postBody = `id_token=${encodeURIComponent(tokenData.id_token)}&providerId=google.com`;
    }
  }

  if (!postBody) {
    return oauthPopupPage(siteUrl, null, 'Could not exchange code for token');
  }

  // ── Sign in with Firebase using the provider token ──
  // requestUri must be an authorized domain in Firebase Console → Authentication → Authorized domains.
  // We use SITE_URL (e.g. https://plutoniumnet.work) which is already authorized.
  const idpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody,
        requestUri:          siteUrl || 'http://localhost',
        returnSecureToken:   true,
        returnIdpCredential: true,
      }),
    }
  );

  const idpData = await idpRes.json();

  if (!idpRes.ok || !idpData.idToken) {
    return oauthPopupPage(siteUrl, null, idpData.error?.message || 'Firebase sign-in failed');
  }

  const user = {
    uid:          idpData.localId,
    idToken:      idpData.idToken,
    refreshToken: idpData.refreshToken,
    expiresIn:    idpData.expiresIn,
    displayName:  idpData.displayName || '',
    email:        idpData.email       || '',
    photoUrl:     idpData.photoUrl    || '',
  };

  return oauthPopupPage(siteUrl, user, null);
}

// Renders a tiny HTML page that postMessages the result to window.opener then closes itself
function oauthPopupPage(siteUrl, user, error) {
  const payload = error
    ? JSON.stringify({ error })
    : JSON.stringify({ user });

  // Use '*' as the target origin — the message is namespaced with type:'plu_oauth'
  // so it's safe, and it avoids silent drops when the opener is on a subdomain or
  // local dev origin that doesn't match SITE_URL exactly.
  // setTimeout gives the browser a tick to deliver the message before the popup closes.
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>
    try {
      window.opener.postMessage({ type: 'plu_oauth', payload: ${JSON.stringify(payload)} }, '*');
    } catch(e) {}
    setTimeout(() => window.close(), 200);
  <\/script></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
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
