const CACHE_NAME = 'lavanderia-shell-v18';
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
  './css/components/calendar.css',
  './css/components/stitch-catalog.css',
  './css/components/procesos-modern.css',
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

  const url = new URL(event.request.url);
  // Jamás interceptar ni cachear rutas dinámicas de la API
  if (url.pathname.startsWith('/api') || url.pathname.includes('/api/')) {
    return;
  }

  // Network-First para siempre servir la versión más reciente en desarrollo/producción
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return Promise.reject('Recurso no disponible offline');
        });
      })
  );
});
