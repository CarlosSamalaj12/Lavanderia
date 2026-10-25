const CACHE_NAME = 'lavanderia-shell-v10';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pw.ico',
  './Logo Blanco app.png',
  './css/main.css',
  './css/base/variables.css',
  './css/base/reset.css',
  './css/base/typography.css',
  './css/layout/container.css',
  './css/layout/nav.css',
  './css/layout/bottom-nav.css',
  './css/layout/print.css',
  './css/components/buttons.css',
  './css/components/cards.css',
  './css/components/forms.css',
  './css/components/tables.css',
  './css/components/modals.css',
  './css/components/toasts.css',
  './css/components/badges.css',
  './css/components/tabs.css',
  './css/components/pedidos.css',
  './css/components/dashboard.css',
  './css/components/tareas.css',
  './js/core/state.js',
  './js/core/api.js',
  './js/core/ui.js',
  './js/modules/auth.js',
  './js/modules/navigation.js',
  './js/modules/dashboard.js',
  './js/modules/procesos.js',
  './js/modules/tareas.js',
  './js/modules/pedidos.js',
  './js/modules/devoluciones.js',
  './js/modules/externa.js',
  './js/modules/catalogos.js',
  './js/modules/reportes.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
