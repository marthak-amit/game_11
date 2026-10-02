// Minimal offline cache (network-first, falls back to cache) so the game keeps working offline.
const C = 'prismrift-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(C).then((ch) => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
