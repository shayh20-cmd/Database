// Service worker for Site Note — lets the app keep working offline on a phone
// once it has been opened successfully at least once.
const CACHE_NAME = 'sitenote-cache-v2';
const CDN_URLS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7/babel.min.js',
];
// Same-origin static assets (manifest + icons) — also never change for a
// given version, so they get the same cache-first treatment as the CDN URLs.
const STATIC_SUFFIXES = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png'];
function isStaticAsset(url) {
  return STATIC_SUFFIXES.some((suffix) => url.endsWith(suffix));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CDN_URLS.concat(STATIC_SUFFIXES.map((s) => '.' + s))).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Pinned vendor scripts never change for a given version — serve from cache
  // immediately once cached, only hitting the network the first time.
  if (CDN_URLS.includes(req.url) || isStaticAsset(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }))
    );
    return;
  }

  // The app page itself: prefer the network (so updates are picked up while
  // online), falling back to whatever was last cached when offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
