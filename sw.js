// Offline-first service worker: everything is precached on first visit, then served from cache.
const VERSION = 'glyde-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css', './fonts/lilita-one.woff2',
  './vendor/three.module.min.js',
  './js/main.js', './js/engine.js', './js/generator.js', './js/solver.js', './js/rng.js', './js/levels.js', './js/gen-worker.js',
  './js/render.js', './js/textures.js', './js/preview.js', './js/ui.js', './js/store.js', './js/data.js', './js/audio.js', './js/haptics.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match('./index.html'));
    }),
  );
});
