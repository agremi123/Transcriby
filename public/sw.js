// Minimal service worker: network-first so every deploy reaches users
// immediately; cache is only a fallback for flaky connections.
const CACHE = 'parisly-v1';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Only handle same-origin GET navigations and static assets
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (request.mode === 'navigate' || /\.(js|css|png|woff2?)$/.test(request.url))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
  );
});
