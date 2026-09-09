const CACHE = 'videe-shell-v6';
const PRECACHE = [
  './app.html',
  './index.html',
  './manifest.webmanifest',
  './icon.png',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (request.headers.has('range')) return;
  if (request.destination === 'video' || request.destination === 'audio') return;
  const marketing = url.pathname === '/' || /\/(site|index)\.html$/.test(url.pathname);

  if (request.mode === 'navigate') {
    if (marketing) {
      event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
      return;
    }
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        void caches.open(CACHE).then(cache => cache.put('./app.html', copy));
        return response;
      }).catch(() => caches.match('./app.html').then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
