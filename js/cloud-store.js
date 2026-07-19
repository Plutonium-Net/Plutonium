/**
 * cloud-store.js — PlutoniumStore
 *
 * A thin, self-contained module that lets any Plutonium feature save and
 * retrieve user-specific data to the cloud, backed by:
 *   • Firestore   — structured per-user documents
 *   • Realtime DB — low-latency live data (presence, counters, etc.)
 *
 * All Firebase credentials are hidden behind a Cloudflare Worker; this
 * module never hard-codes secrets.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   // Sign the user in (shows Google popup):
 *   const user = await PlutoniumStore.signIn();
 *
 *   // Sign in with email + password:
 *   const user = await PlutoniumStore.signInWithEmail('user@example.com', 'password');
 *
 *   // Create a new account:
 *   const user = await PlutoniumStore.signUp('user@example.com', 'password', 'Display Name');
 *
 *   // Send a password-reset email:
 *   await PlutoniumStore.resetPassword('user@example.com');
 *
 *   // Save a document at users/{uid}/settings:
 *   await PlutoniumStore.setDoc('settings', { theme: 'dark', volume: 0.8 });
 *
 *   // Read it back:
 *   const doc = await PlutoniumStore.getDoc('settings');
 *
 *   // Write to Realtime DB at users/{uid}/presence:
 *   await PlutoniumStore.setRTDB('presence', { online: true, ts: Date.now() });
 *
 *   // Read from Realtime DB:
 *   const presence = await PlutoniumStore.getRTDB('presence');
 *
 *   // Listen to Realtime DB path (polling — RTDB SSE requires native SDK):
 *   const stop = PlutoniumStore.watchRTDB('presence', data => console.log(data), 5000);
 *   // later: stop();
 *
 *   // Subscribe to auth state changes:
 *   PlutoniumStore.onAuthChange(user => { ... });
 *
 *   // Sign out:
 *   await PlutoniumStore.signOut();
 *
 * ── Worker URL ──────────────────────────────────────────────────────────────
 *   Set PlutoniumStore.WORKER_URL before first use, e.g. in your page's
 *   <script> block or main.js:
 *
 *     PlutoniumStore.WORKER_URL = 'https://plutonium-firebase-proxy.craftedgamz.workers.dev';
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── State ──────────────────────────────────────────────────────────────── */
  let _workerUrl    = '';        // set via PlutoniumStore.WORKER_URL
  let _config       = null;      // firebase config fetched from worker
  let _currentUser  = null;      // { uid, idToken, refreshToken, expiresAt, displayName, email, photoUrl }
  let _authListeners = [];       // callbacks registered via onAuthChange()
  let _refreshTimer  = null;

  /* ── Google Identity Services (GIS) ────────────────────────────────────── */
  // We use the Google Identity Services library (loaded lazily) for the
  // sign-in popup.  The library is ~50 KB and only fetched when signIn() is
  // called for the first time.
  let _gisLoaded = false;
  let _googleClient = null;

  function loadGIS() {
    return new Promise((resolve, reject) => {
      if (_gisLoaded) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload  = () => { _gisLoaded = true; resolve(); };
      s.onerror = () => reject(new Error('[PlutoniumStore] Failed to load GIS'));
      document.head.appendChild(s);
    });
  }

  /* ── Config ─────────────────────────────────────────────────────────────── */
  async function fetchConfig() {
    if (_config) return _config;
    assertWorkerUrl();
    const res = await fetch(`${_workerUrl}/config`);
    if (!res.ok) throw new Error(`[PlutoniumStore] Failed to fetch config (${res.status})`);
    _config = await res.json();
    return _config;
  }

  /* ── Auth ───────────────────────────────────────────────────────────────── */
  async function signIn() {
    const cfg = await fetchConfig();
    await loadGIS();

    return new Promise((resolve, reject) => {
      _googleClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId || _getGoogleClientId(cfg),
        scope: 'openid email profile',
        callback: async (response) => {
          if (response.error) { reject(new Error(response.error)); return; }
          try {
            // Exchange the Google access token for a Firebase ID token
            const user = await exchangeGoogleToken(response.access_token);
            _setUser(user);
            resolve(_currentUser);
          } catch (e) {
            reject(e);
          }
        },
      });
      _googleClient.requestAccessToken({ prompt: 'select_account' });
    });
  }

  // For the GIS token flow we need to call the Firebase signInWithIdp endpoint
  // via the worker's /auth/token route, but first we must get an ID token from
  // Google. We do a small extra fetch to tokeninfo to get the ID token from
  // the access token.
  async function exchangeGoogleToken(accessToken) {
    // Convert access_token → id_token via Google's tokeninfo
    const tiRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
    );
    const tiData = await tiRes.json();
    if (!tiData.sub) throw new Error('[PlutoniumStore] Could not resolve Google ID token');

    // Use the access_token directly as a bearer credential for Firebase
    // signInWithIdp (it also accepts access_token in postBody)
    assertWorkerUrl();
    const res = await fetch(`${_workerUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: accessToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`[PlutoniumStore] Auth exchange failed: ${JSON.stringify(data)}`);

    return {
      uid:          data.localId,
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      expiresAt:    Date.now() + parseInt(data.expiresIn, 10) * 1000,
      displayName:  data.displayName || tiData.name || '',
      email:        data.email        || tiData.email || '',
      photoUrl:     data.photoUrl     || tiData.picture || '',
    };
  }

  async function refreshIdToken() {
    if (!_currentUser?.refreshToken) return;
    assertWorkerUrl();
    const cfg = await fetchConfig();

    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type:    'refresh_token',
          refresh_token: _currentUser.refreshToken,
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.warn('[PlutoniumStore] Token refresh failed — signing out');
      await signOut();
      return;
    }
    _currentUser.idToken    = data.id_token;
    _currentUser.expiresAt  = Date.now() + parseInt(data.expires_in, 10) * 1000;
    _persist();
  }

  function _scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    if (!_currentUser) return;
    const delay = Math.max(0, _currentUser.expiresAt - Date.now() - 5 * 60 * 1000);
    _refreshTimer = setTimeout(refreshIdToken, delay);
  }

  function _setUser(user) {
    _currentUser = user;
    _persist();
    _scheduleRefresh();
    _authListeners.forEach(fn => { try { fn(user); } catch (_) {} });
  }

  function _persist() {
    try {
      if (_currentUser) {
        localStorage.setItem('plu_user', JSON.stringify(_currentUser));
      } else {
        localStorage.removeItem('plu_user');
      }
    } catch (_) {}
  }

  function _restoreSession() {
    try {
      const raw = localStorage.getItem('plu_user');
      if (!raw) return;
      const user = JSON.parse(raw);
      if (!user?.idToken) return;
      _currentUser = user;
      // If token is already expired, refresh immediately; otherwise schedule
      if (Date.now() >= user.expiresAt) {
        refreshIdToken();
      } else {
        _scheduleRefresh();
      }
      _authListeners.forEach(fn => { try { fn(_currentUser); } catch (_) {} });
    } catch (_) {}
  }

  async function signInWithEmail(email, password) {
    assertWorkerUrl();
    const res = await fetch(`${_workerUrl}/auth/email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`[PlutoniumStore] signInWithEmail failed: ${data.error || JSON.stringify(data)}`);
    const user = {
      uid:          data.localId,
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      expiresAt:    Date.now() + parseInt(data.expiresIn, 10) * 1000,
      displayName:  data.displayName || '',
      email:        data.email,
      photoUrl:     data.photoUrl || '',
    };
    _setUser(user);
    return _currentUser;
  }

  async function signUp(email, password, displayName = '') {
    assertWorkerUrl();
    const res = await fetch(`${_workerUrl}/auth/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`[PlutoniumStore] signUp failed: ${data.error || JSON.stringify(data)}`);
    const user = {
      uid:          data.localId,
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      expiresAt:    Date.now() + parseInt(data.expiresIn, 10) * 1000,
      displayName:  data.displayName || '',
      email:        data.email,
      photoUrl:     '',
    };
    _setUser(user);
    return _currentUser;
  }

  async function resetPassword(email) {
    assertWorkerUrl();
    const res = await fetch(`${_workerUrl}/auth/reset`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`[PlutoniumStore] resetPassword failed: ${data.error || JSON.stringify(data)}`);
  }

  async function signOut() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _currentUser = null;
    _persist();
    _authListeners.forEach(fn => { try { fn(null); } catch (_) {} });
  }

  function onAuthChange(callback) {
    _authListeners.push(callback);
    // Fire immediately with current state
    try { callback(_currentUser); } catch (_) {}
    return () => {
      _authListeners = _authListeners.filter(fn => fn !== callback);
    };
  }

  /* ── Token helper ───────────────────────────────────────────────────────── */
  async function _authHeader() {
    if (!_currentUser) throw new Error('[PlutoniumStore] Not signed in');
    if (Date.now() >= _currentUser.expiresAt - 30_000) await refreshIdToken();
    return { Authorization: `Bearer ${_currentUser.idToken}` };
  }

  /* ── Firestore ──────────────────────────────────────────────────────────── */
  // Documents are stored at: users/{uid}/{collection}
  // The `collection` arg is a simple collection name (e.g. "settings", "scores").
  // For sub-paths, pass e.g. "prefs/appearance".

  async function setDoc(collection, data) {
    assertWorkerUrl();
    const uid = _requireUser();
    const auth = await _authHeader();
    const path = `/users/${uid}/${collection}`;

    // Convert plain JS object to Firestore REST fields format
    const fields = toFirestoreFields(data);

    const res = await fetch(`${_workerUrl}/firestore${path}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body:    JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[PlutoniumStore] setDoc failed: ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  async function getDoc(collection) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const path = `/users/${uid}/${collection}`;

    const res = await fetch(`${_workerUrl}/firestore${path}`, {
      headers: auth,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[PlutoniumStore] getDoc failed: ${JSON.stringify(err)}`);
    }
    const doc = await res.json();
    return doc.fields ? fromFirestoreFields(doc.fields) : null;
  }

  async function deleteDoc(collection) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const path = `/users/${uid}/${collection}`;

    const res = await fetch(`${_workerUrl}/firestore${path}`, {
      method:  'DELETE',
      headers: auth,
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`[PlutoniumStore] deleteDoc failed (${res.status})`);
    }
  }

  /* ── Firestore field serialisation ─────────────────────────────────────── */
  function toFirestoreFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = toFirestoreValue(v);
    }
    return fields;
  }

  function toFirestoreValue(v) {
    if (v === null)                    return { nullValue: null };
    if (typeof v === 'boolean')        return { booleanValue: v };
    if (typeof v === 'number') {
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    }
    if (typeof v === 'string')         return { stringValue: v };
    if (Array.isArray(v))              return { arrayValue: { values: v.map(toFirestoreValue) } };
    if (v instanceof Date)             return { timestampValue: v.toISOString() };
    if (typeof v === 'object')         return { mapValue: { fields: toFirestoreFields(v) } };
    return { stringValue: String(v) };
  }

  function fromFirestoreFields(fields) {
    const obj = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }

  function fromFirestoreValue(v) {
    if ('nullValue'      in v) return null;
    if ('booleanValue'   in v) return v.booleanValue;
    if ('integerValue'   in v) return parseInt(v.integerValue, 10);
    if ('doubleValue'    in v) return v.doubleValue;
    if ('stringValue'    in v) return v.stringValue;
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('arrayValue'     in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue'       in v) return fromFirestoreFields(v.mapValue.fields || {});
    return undefined;
  }

  /* ── Realtime Database ──────────────────────────────────────────────────── */
  // RTDB paths are rooted at users/{uid}/{path}

  async function setRTDB(path, data) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const full = `/users/${uid}/${path.replace(/^\/+/, '')}`;

    const res = await fetch(`${_workerUrl}/rtdb${full}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[PlutoniumStore] setRTDB failed: ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  async function updateRTDB(path, data) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const full = `/users/${uid}/${path.replace(/^\/+/, '')}`;

    const res = await fetch(`${_workerUrl}/rtdb${full}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[PlutoniumStore] updateRTDB failed: ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  async function getRTDB(path) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const full = `/users/${uid}/${path.replace(/^\/+/, '')}`;

    const res = await fetch(`${_workerUrl}/rtdb${full}`, { headers: auth });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[PlutoniumStore] getRTDB failed: ${JSON.stringify(err)}`);
    }
    return res.json();   // null if the path doesn't exist in RTDB
  }

  async function deleteRTDB(path) {
    assertWorkerUrl();
    const uid  = _requireUser();
    const auth = await _authHeader();
    const full = `/users/${uid}/${path.replace(/^\/+/, '')}`;

    const res = await fetch(`${_workerUrl}/rtdb${full}`, {
      method:  'DELETE',
      headers: auth,
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`[PlutoniumStore] deleteRTDB failed (${res.status})`);
    }
  }

  /**
   * Poll a Realtime DB path at a given interval.
   * Returns a stop() function.
   */
  function watchRTDB(path, callback, intervalMs = 5000) {
    let active = true;
    async function tick() {
      if (!active) return;
      try {
        const data = await getRTDB(path);
        callback(data);
      } catch (e) {
        // Not signed in yet — skip silently
      }
      if (active) setTimeout(tick, intervalMs);
    }
    tick();
    return () => { active = false; };
  }

  /* ── Guards ──────────────────────────────────────────────────────────────── */
  function assertWorkerUrl() {
    if (!_workerUrl) {
      throw new Error(
        '[PlutoniumStore] WORKER_URL is not set. ' +
        'Set PlutoniumStore.WORKER_URL = "https://..." before using the store.'
      );
    }
  }

  function _requireUser() {
    if (!_currentUser) throw new Error('[PlutoniumStore] Not signed in');
    return _currentUser.uid;
  }

  /* ── Misc helper ─────────────────────────────────────────────────────────── */
  function _getGoogleClientId(cfg) {
    // The Firebase project's OAuth clientId is not in the standard config
    // response. If you supply it via the worker /config, great. Otherwise
    // you can set PlutoniumStore.GOOGLE_CLIENT_ID manually.
    if (_googleClientId) return _googleClientId;
    throw new Error(
      '[PlutoniumStore] Google OAuth Client ID not found. ' +
      'Set PlutoniumStore.GOOGLE_CLIENT_ID = "....apps.googleusercontent.com"'
    );
  }

  let _googleClientId = '';

  /* ── Bootstrap ───────────────────────────────────────────────────────────── */
  _restoreSession();

  /* ── Public API ──────────────────────────────────────────────────────────── */
  window.PlutoniumStore = {
    // Config
    set WORKER_URL(url)       { _workerUrl = url.replace(/\/$/, ''); },
    get WORKER_URL()          { return _workerUrl; },
    set GOOGLE_CLIENT_ID(id)  { _googleClientId = id; },
    get GOOGLE_CLIENT_ID()    { return _googleClientId; },

    // Auth
    signIn,
    signInWithEmail,
    signUp,
    resetPassword,
    signOut,
    onAuthChange,
    get currentUser()         { return _currentUser ? { ..._currentUser } : null; },

    // Firestore
    setDoc,
    getDoc,
    deleteDoc,

    // Realtime Database
    setRTDB,
    getRTDB,
    updateRTDB,
    deleteRTDB,
    watchRTDB,
  };
})();
