'use strict';

const DB_NAME    = 'plutonium_personal_games';
const DB_VERSION = 1;
const FILE_STORE = 'pg_files';
const META_STORE = 'pg_meta';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(db, store, value, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = key !== undefined
      ? tx.objectStore(store).put(value, key)
      : tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const ROUTE_RE = /^\/pg-game\/([^/]+)\/(.+)$/;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const m   = ROUTE_RE.exec(url.pathname);
  if (!m) return;

  const gameId   = m[1];
  const filePath = m[2];

  e.respondWith(
    openDB().then(db => dbGet(db, FILE_STORE, `${gameId}/${filePath}`)).then(async entry => {
      if (entry) {
        return new Response(entry.data, {
          status: 200,
          headers: { 'Content-Type': entry.type || 'application/octet-stream' },
        });
      }

      try {
        const db = await openDB();
        const meta = await dbGet(db, META_STORE, gameId).catch(() => null);
        if (meta && meta.github) {
          const gh = meta.github;
          const rawRel = gh.root ? (gh.root + '/' + filePath) : filePath;
          const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${gh.branch}/${rawRel}`;
          const fetched = await fetch(rawUrl);
          if (fetched && fetched.ok) {
            const buf = await fetched.arrayBuffer();
            const ctype = fetched.headers.get('content-type') || 'application/octet-stream';
            await dbPut(db, FILE_STORE, { type: ctype, data: buf }, `${gameId}/${filePath}`);
            return new Response(buf, { status: 200, headers: { 'Content-Type': ctype } });
          }
        }
      } catch (_) {}

      return new Response('File not found', { status: 404 });
    }).catch(() => new Response('Service worker error', { status: 500 }))
  );
});
