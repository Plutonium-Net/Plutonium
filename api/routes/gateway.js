/**
 * Firebase gateway routes: /config, /auth/*, /firestore/*, /rtdb/*.
 *
 * Ported from cf-worker/firebase-gateway with the same behaviour. The only
 * intentional difference is that the orphaned /vm/session handler is gone —
 * nothing called it, and it duplicated /vm/session with no rate limit.
 *
 * Firestore and RTDB are deliberately thin proxies: the caller's own ID token
 * is forwarded upstream, and Firebase security rules decide what that token may
 * touch. The uid in `/users/{uid}/…` is chosen by the client, so the rules are
 * the only thing preventing cross-user access.
 */

import { json, fail } from '../lib/responses.js';

export async function handle(request, env, url, path) {
  if (path === '/config' && request.method === 'GET') {
    return handleConfig(env);
  }

  if (path === '/auth/email' && request.method === 'POST') {
    return handleEmailSignIn(request, env);
  }

  if (path === '/auth/signup' && request.method === 'POST') {
    return handleEmailSignUp(request, env);
  }

  if (path === '/auth/reset' && request.method === 'POST') {
    return handlePasswordReset(request, env);
  }

  if (path === '/auth/update' && request.method === 'POST') {
    return handleProfileUpdate(request, env);
  }

  if (path === '/auth/delete' && request.method === 'POST') {
    return handleAccountDelete(request, env);
  }

  if (path === '/auth/password' && request.method === 'POST') {
    return handlePasswordChange(request, env);
  }

  if (path === '/auth/providers' && request.method === 'POST') {
    return handleListProviders(request, env);
  }

  if (path === '/auth/unlink' && request.method === 'POST') {
    return handleUnlinkProvider(request, env);
  }

  if (path === '/auth/link' && request.method === 'POST') {
    return handleLinkProvider(request, env);
  }

  if (path === '/auth/oauth/start' && request.method === 'GET') {
    return handleOAuthStart(request, env, url);
  }

  if (path === '/auth/oauth/callback' && request.method === 'GET') {
    return handleOAuthCallback(request, env, url);
  }

  if (path.startsWith('/firestore/')) {
    return handleFirestore(request, env, path);
  }

  if (path.startsWith('/rtdb/')) {
    return handleRTDB(request, env, path, url);
  }

  return fail('Not found', 404);
}

function handleConfig(env) {
  return json({
    apiKey:            env.FIREBASE_API_KEY,
    projectId:         env.FIREBASE_PROJECT_ID,
    databaseURL:       env.FIREBASE_DATABASE_URL,
    authDomain:        `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    storageBucket:     `${env.FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             env.FIREBASE_APP_ID || '',
  });
}

async function handleEmailSignIn(request, env) {
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password) return fail('email and password required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);

  return json({
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    localId:      data.localId,
    displayName:  data.displayName || '',
    email:        data.email,
    photoUrl:     data.photoUrl || '',
  });
}

async function handleEmailSignUp(request, env) {
  const { email, password, displayName } = await request.json().catch(() => ({}));
  if (!email || !password) return fail('email and password required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);

  if (displayName) {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: false }),
      }
    );
  }

  return json({
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    localId:      data.localId,
    displayName:  displayName || '',
    email:        data.email,
    photoUrl:     '',
  });
}

async function handlePasswordReset(request, env) {
  const { email } = await request.json().catch(() => ({}));
  if (!email) return fail('email required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);
  return json({ email: data.email });
}

async function handleProfileUpdate(request, env) {
  const { idToken, displayName } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken, displayName: displayName || '', returnSecureToken: false }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);
  return json({ displayName: data.displayName || '' });
}

async function handleAccountDelete(request, env) {
  const { idToken } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);

  let uid = null;
  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken }),
      }
    );
    const lookup = await lookupRes.json();
    uid = (lookup.users && lookup.users[0] && lookup.users[0].localId) || null;
  } catch (_) {}

  if (!uid) return fail('Could not verify account', 401);

  // Purge BEFORE deleting the auth user. Once accounts:delete succeeds this
  // idToken is dead, so every purge request afterwards would 401 and the whole
  // data removal would silently do nothing.
  let purge;
  try {
    purge = await deleteUserFirestoreData(env, uid, idToken);
  } catch (err) {
    console.error('[api] purge failed for', uid, err);
    return fail(
      'Account not deleted: your cloud data could not be removed, so nothing was deleted. Please try again.',
      502,
      { detail: String((err && err.message) || err) }
    );
  }

  // If some documents could not be removed, stop BEFORE deleting the auth user:
  // otherwise the leftovers could never be purged. Keeping the account alive
  // also keeps a retry possible.
  if (purge.errors.length) {
    console.error('[api] incomplete purge for', uid, purge.errors);
    return fail(
      'Account not deleted: some cloud data could not be removed, so nothing was deleted. Please try again.',
      502,
      { removed: purge.removed, errors: purge.errors }
    );
  }

  const delRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    }
  );

  const data = await delRes.json();
  if (!delRes.ok) return json(data, delRes.status);

  return json({ deleted: true, removed: purge.removed });
}

async function handlePasswordChange(request, env) {
  const { idToken, newPassword } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);
  if (!newPassword || String(newPassword).length < 6) {
    return fail('Password must be at least 6 characters', 400);
  }

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken, password: String(newPassword) }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);
  return json({ ok: true });
}

async function handleListProviders(request, env) {
  const { idToken } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);

  const user = (data.users && data.users[0]) || {};
  const providers = (user.providerUserInfo || []).map(p => ({
    providerId: p.providerId || '',
    email:      p.email || '',
    photoUrl:   p.photoUrl || '',
  }));

  return json({
    providers,
    displayName: user.displayName || '',
    email:       user.email || '',
  });
}

async function handleUnlinkProvider(request, env) {
  const { idToken, providerId } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);
  if (!providerId) return fail('providerId required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken, deleteProvider: [providerId] }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);
  return json({ ok: true });
}

async function handleLinkProvider(request, env) {
  const { idToken, providerId, oauthAccessToken } = await request.json().catch(() => ({}));
  if (!idToken) return fail('idToken required', 400);
  if (!providerId || !oauthAccessToken) return fail('providerId and oauthAccessToken required', 400);

  const upstream = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken, provider: [providerId], oauthAccessToken }),
    }
  );

  const data = await upstream.json();
  if (!upstream.ok) return json(data, upstream.status);
  return json({ ok: true });
}

const FIRESTORE_BASE = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * The canonical list of per-user Firestore documents.
 *
 * IMPORTANT: the admin console keeps a mirror of this list. If you add a
 * collection to PlutoniumStore, update BOTH or the console will mislabel it and
 * fail to purge it.
 */
export const USER_FIRESTORE_DOCS = [
  '/users/{uid}',
  '/users/{uid}/bookmarks/_default',
  '/users/{uid}/history/_default',
  '/users/{uid}/pins/_default',
  '/users/{uid}/settings/_default',
  '/users/{uid}/tabs/_default',
  '/users/{uid}/recent/_default',
  '/users/{uid}/notices/_default',
  '/users/{uid}/ai_chats/_default',
  '/users/{uid}/ai_memory/_default',
  '/users/{uid}/ai_personas/_default',
  '/users/{uid}/nav_prefs/_default',
  '/users/{uid}/stream_favorites/_default',
  '/users/{uid}/stream_continue/_default',
  '/users/{uid}/stream_prefs/_default',
  '/users/{uid}/games_data/saved',
  '/users/{uid}/personal_games/meta',
  '/users/{uid}/profile_photo/_default',
];

/** Sub-collections that hold one document per id and must be walked. */
export const USER_FIRESTORE_COLLECTIONS = [
  'game_saves',
  'personal_games',
  'games_data',
  'pg_files',
];

const FIRESTORE_DOCS_API = 'https://firestore.googleapis.com/v1/';

/** Requests are authenticated with the caller's own Firebase ID token. */
function purgeHeaders(idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

/** Delete one document by absolute REST resource name. 404 counts as success. */
async function deleteFirestoreResource(resourceName, idToken) {
  const res = await fetch(`${FIRESTORE_DOCS_API}${resourceName}`, {
    method:  'DELETE',
    headers: purgeHeaders(idToken),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`DELETE ${resourceName} -> HTTP ${res.status}`);
  }
}

/** Delete one document by path relative to the documents root. */
async function deleteFirestoreDoc(env, docPath, idToken) {
  await deleteFirestoreResource(
    docPath.replace(/^\//, `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/`),
    idToken
  );
}

/**
 * Delete every document in a collection, one page at a time. The previous
 * implementation fetched a single page of 300 and stopped, so larger
 * collections were only partially purged.
 */
async function deleteFirestoreCollection(env, collectionPath, idToken, errors) {
  const base = `${FIRESTORE_BASE(env)}/${collectionPath.replace(/^\//, '')}`;
  let pageToken = '';
  let removed   = 0;

  // Bounded loop: a server bug must not spin forever deleting documents.
  for (let page = 0; page < 500; page++) {
    const url = new URL(base);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), { headers: purgeHeaders(idToken) });
    if (res.status === 404) return removed;
    if (!res.ok) throw new Error(`LIST ${collectionPath} -> HTTP ${res.status}`);

    const data = await res.json();
    for (const doc of (data.documents || [])) {
      try {
        await deleteFirestoreResource(doc.name, idToken);
        removed++;
      } catch (err) {
        errors.push(String((err && err.message) || err));
      }
    }

    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }

  return removed;
}

/**
 * Remove every Firestore document belonging to a user. Throws if a listing
 * fails outright so the caller can refuse to report a successful deletion;
 * per-document failures are collected in `errors`.
 */
async function deleteUserFirestoreData(env, uid, idToken) {
  const errors  = [];
  let   removed = 0;

  for (const template of USER_FIRESTORE_DOCS) {
    try {
      await deleteFirestoreDoc(env, template.replace('{uid}', uid), idToken);
      removed++;
    } catch (err) {
      errors.push(String((err && err.message) || err));
    }
  }

  for (const collection of USER_FIRESTORE_COLLECTIONS) {
    removed += await deleteFirestoreCollection(env, `users/${uid}/${collection}`, idToken, errors);
  }

  return { removed, errors };
}

async function handleOAuthStart(request, env, url) {
  const provider    = url.searchParams.get('provider');
  const mode        = url.searchParams.get('mode') || 'signin';
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  const encodedState = `${provider}:${crypto.randomUUID()}:${mode}`;

  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID) return fail('GITHUB_CLIENT_ID not configured', 500);
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id',    env.GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('scope',        'read:user user:email');
    authUrl.searchParams.set('state',        encodedState);
    return Response.redirect(authUrl.toString(), 302);
  }

  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID) return fail('GOOGLE_CLIENT_ID not configured', 500);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',     env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',  callbackUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope',         'openid email profile');
    authUrl.searchParams.set('state',         encodedState);
    return Response.redirect(authUrl.toString(), 302);
  }

  return fail('Unknown provider', 400);
}

async function handleOAuthCallback(request, env, url) {
  const siteUrl     = (env.SITE_URL || '').replace(/\/$/, '');
  const workerUrl   = new URL(request.url).origin;
  const callbackUri = `${workerUrl}/auth/oauth/callback`;

  const code  = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error_description') || url.searchParams.get('error') || '';

  const stateParts = (url.searchParams.get('state') || '').split(':');
  const provider   = stateParts[0];
  const mode       = stateParts[2] || 'signin';

  if (error || !code) {
    return oauthPopupPage(siteUrl, null, error || 'No code returned from provider');
  }

  let accessToken = null;
  let idToken     = null;
  let postBody    = null;

  if (provider === 'github') {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  callbackUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      accessToken = tokenData.access_token;
      postBody = `access_token=${encodeURIComponent(accessToken)}&providerId=github.com`;
    }
  }

  if (provider === 'google') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  callbackUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.id_token) {
      idToken = tokenData.id_token;
      postBody = `id_token=${encodeURIComponent(idToken)}&providerId=google.com`;
    }
    accessToken = tokenData.access_token || null;
  }

  if (!postBody) {
    return oauthPopupPage(siteUrl, null, 'Could not exchange code for token');
  }

  if (mode === 'link') {
    const providerId = provider === 'github' ? 'github.com' : 'google.com';
    if (!accessToken) {
      return oauthPopupPage(siteUrl, null, 'Could not obtain access token', 'plu_oauth_link');
    }
    return oauthPopupPage(siteUrl, { link: { providerId, accessToken } }, null, 'plu_oauth_link');
  }

  const idpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${env.FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
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

  return oauthPopupPage(siteUrl, {
    uid:          idpData.localId,
    idToken:      idpData.idToken,
    refreshToken: idpData.refreshToken,
    expiresIn:    idpData.expiresIn,
    displayName:  idpData.displayName || '',
    email:        idpData.email       || '',
    photoUrl:     idpData.photoUrl    || '',
  }, null);
}

function oauthPopupPage(siteUrl, user, error, messageType = 'plu_oauth') {
  const payload = error
    ? JSON.stringify({ error })
    : JSON.stringify({ user });

  const body = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>
    try {
      window.opener.postMessage({ type: '${messageType}', payload: ${JSON.stringify(payload)} }, '*');
    } catch(e) {}
    setTimeout(() => window.close(), 200);
  <\/script></body></html>`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function handleFirestore(request, env, path) {
  const firestorePath = path.replace(/^\/firestore/, '');
  const upstream = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents${firestorePath}`;

  const resp = await fetch(buildUpstreamRequest(request, upstream));
  return proxiedResponse(resp);
}

async function handleRTDB(request, env, path, url) {
  const rtdbPath = path.replace(/^\/rtdb/, '');
  const queryString = url.search || '';
  const upstream = `${env.FIREBASE_DATABASE_URL}${rtdbPath}.json${queryString}`;

  const resp = await fetch(buildUpstreamRequest(request, upstream));
  return proxiedResponse(resp);
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

async function proxiedResponse(upstreamResp) {
  const body = await upstreamResp.text();
  return new Response(body, {
    status:  upstreamResp.status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
