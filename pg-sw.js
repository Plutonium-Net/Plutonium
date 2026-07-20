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
    openDB().then(db => dbGet(db, FILE_STORE, `${gameId}/${filePath}`)).then(entry => {
      if (!entry) {
        return new Response('File not found', { status: 404 });
      }
      return new Response(entry.data, {
        status: 200,
        headers: { 'Content-Type': entry.type || 'application/octet-stream' },
      });
    }).catch(() => new Response('Service worker error', { status: 500 }))
  );
});
