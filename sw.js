// Service worker: la app funciona sin conexión. Sube VERSION al publicar cambios.
const VERSION = 'dinerico-v3';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/util.js', './js/store.js', './js/defaults.js', './js/calc.js', './js/prices.js', './js/charts.js', './js/ui.js', './js/forms.js',
  './js/views/lock.js', './js/views/main.js', './js/views/plan.js', './js/views/money.js', './js/views/invest.js', './js/views/reports.js', './js/views/settings.js', './js/views/onboarding.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // APIs externas: siempre red
  // Red primero (para recibir actualizaciones) con caché como respaldo sin conexión
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
