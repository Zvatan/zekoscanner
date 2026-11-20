// Çevrimdışı çalışma: uygulama dosyalarını önbelleğe alır. Yeni sürüm
// yayınlarken VERSION değerini artırın; kullanıcıya "Yenile" seçeneği çıkar.
const VERSION = 'zeko-tara-v1.0.0';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/crop-view.js',
  './js/engine.js',
  './js/export.js',
  './js/image-io.js',
  './js/reorder.js',
  './js/store.js',
  './js/ui.js',
  './js/worker.js',
  './js/core/detect.js',
  './js/core/filters.js',
  './js/core/geometry.js',
  './js/core/imageops.js',
  './js/core/pdf.js',
  './js/core/session.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'activate') self.skipWaiting();
});

// Önce önbellek: uygulama ağ olmadan da açılır. Gezinme istekleri her zaman
// önbellekteki index.html ile karşılanır.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
