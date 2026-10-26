/* ==========================================================================
 * Bóveda · sw.js
 * Service worker: permite instalar la app en el celular y usarla sin conexión.
 *
 * Estrategia: RED PRIMERO, caché como respaldo.
 *   - Siempre intenta la red (así las actualizaciones llegan solas).
 *   - Si no hay conexión, sirve la copia guardada.
 *
 * Nunca toca datos de la aplicación: los documentos viven cifrados en
 * IndexedDB, no en la caché. Aquí solo se cachea el "cascarón" de la app.
 * ========================================================================== */
'use strict';

const CACHE = 'boveda-__BUILD__';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './vendor/jspdf.umd.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/jszip.min.js',
  './vendor/docx-preview.min.js',
  './js/config.js',
  './js/utils.js',
  './js/crypto.js',
  './js/state.js',
  './js/store.js',
  './js/auth.js',
  './js/ui.js',
  './js/views.js',
  './js/documents.js',
  './js/scanner.js',
  './js/info.js',
  './js/settings.js',
  './js/share.js',
  './js/gdrive-config.js',
  './js/gdrive.js',
  './js/onedrive.js',
  './js/app.js',
  './js/excel.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(ASSETS.map(a => cache.add(a).catch(() => { }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Solo recursos propios: se ignoran blob:, data:, otros dominios y las
  // rutas internas del servidor de pruebas (/__test, /__report).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/__') !== -1) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { });
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || caches.match('./index.html'))
      )
  );
});
