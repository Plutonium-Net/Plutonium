self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  console.log('[__swtest] fetch', event.request.url)
  event.respondWith(new Response('swtest:' + event.request.url, { headers: { 'content-type': 'text/plain' } }))
})
