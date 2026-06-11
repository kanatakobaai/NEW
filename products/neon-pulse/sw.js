// Minimal offline-first service worker for the PWA.
const CACHE = 'neon-pulse-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/main.js',
  './js/engine/math.js',
  './js/engine/particles.js',
  './js/engine/audio.js',
  './js/engine/input.js',
  './js/game/game.js',
  './js/game/hazard.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
