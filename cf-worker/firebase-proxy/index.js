export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const allowed = resolveAllowedOrigin(origin, env.ALLOWED_ORIGIN || '*');

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, allowed);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' && request.method === 'GET') {
        return handleHomepage();
      }

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

function handleConfig(env, allowed) {
  const config = {
    apiKey:            env.FIREBASE_API_KEY,
    projectId:         env.FIREBASE_PROJECT_ID,
    databaseURL:       env.FIREBASE_DATABASE_URL,
    authDomain:        `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    storageBucket:     `${env.FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             env.FIREBASE_APP_ID || '',
  };
  return corsResponse(config, 200, allowed);
}

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

async function handleEmailSignUp(request, env, allowed) {
  const { email, password, displayName } = await request.json();
  if (!email || !password) return corsResponse({ error: 'email and password required' }, 400, allowed);

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

async function handleOAuthStart(request, env, url) {
  const provider    = url.searchParams.get('provider');
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  const state = crypto.randomUUID();
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

async function handleOAuthCallback(request, env, url) {
  const siteUrl     = (env.SITE_URL || '').replace(/\/$/, '');
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  const code     = url.searchParams.get('code');
  const error    = url.searchParams.get('error');
  const provider = (url.searchParams.get('state') || '').split(':')[0];

  if (error || !code) {
    return oauthPopupPage(siteUrl, null, error || 'No code returned from provider');
  }

  let postBody = null;

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

function oauthPopupPage(siteUrl, user, error) {
  const payload = error
    ? JSON.stringify({ error })
    : JSON.stringify({ user });

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

async function handleFirestore(request, env, allowed, path) {
  const firestorePath = path.replace(/^\/firestore/, '');
  const upstream = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${firestorePath}`;

  const upstreamReq = buildUpstreamRequest(request, upstream);
  const resp = await fetch(upstreamReq);
  return proxiedResponse(resp, allowed);
}

async function handleRTDB(request, env, allowed, path, originalUrl) {
  const rtdbPath = path.replace(/^\/rtdb/, '');
  const qs = originalUrl.search || '';
  const upstream = `${env.FIREBASE_DATABASE_URL}${rtdbPath}.json${qs}`;

  const upstreamReq = buildUpstreamRequest(request, upstream);
  const resp = await fetch(upstreamReq);
  return proxiedResponse(resp, allowed);
}

function buildUpstreamRequest(original, upstreamUrl) {
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

function handleHomepage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium Firebase Proxy</title>
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
</style>
</head>
<body>
<div class="hero">
<div class="hero__inner">
<h1 class="hero__title">Plutonium Firebase Proxy</h1>
<p class="hero__desc">A Cloudflare Worker that proxies Firebase Auth, Firestore, and Realtime Database — keeping API keys server-side and adding CORS handling for browser clients.</p>
<div class="section">
<div class="section__heading">Endpoints</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>GET</code></td><td><code>/config</code></td><td>Returns sanitised Firebase client config</td></tr>
<tr><td><code>POST</code></td><td><code>/auth/email</code></td><td>Sign in with email &amp; password</td></tr>
<tr><td><code>POST</code></td><td><code>/auth/signup</code></td><td>Create a new email account</td></tr>
<tr><td><code>POST</code></td><td><code>/auth/reset</code></td><td>Send a password-reset e-mail</td></tr>
<tr><td><code>POST</code></td><td><code>/auth/update</code></td><td>Update display name</td></tr>
<tr><td><code>POST</code></td><td><code>/auth/delete</code></td><td>Delete the authenticated account</td></tr>
<tr><td><code>GET</code></td><td><code>/auth/oauth/start</code></td><td>Redirect to GitHub or Google OAuth</td></tr>
<tr><td><code>GET</code></td><td><code>/auth/oauth/callback</code></td><td>OAuth callback — exchanges code for Firebase token</td></tr>
<tr><td><code>*</code></td><td><code>/firestore/…</code></td><td>Proxy to Firestore REST API</td></tr>
<tr><td><code>*</code></td><td><code>/rtdb/…</code></td><td>Proxy to Realtime Database REST API</td></tr>
</tbody>
</table>
</div>
</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
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
