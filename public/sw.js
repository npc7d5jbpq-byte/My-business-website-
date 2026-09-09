// Minimal service worker: only makes the app installable (via manifest.json)
// and speeds up repeat loads of the static shell (CSS/JS/images/icons).
//
// It deliberately never touches API calls or page navigations - this is a
// live business ledger, and serving stale financial data (or a stale login
// page while the server has moved on) would be actively harmful. Only
// fingerprinted-by-extension static assets are cached, stale-while-
// revalidate style.

const CACHE_NAME = 'gco-shell-v1';
const SHELL_ASSETS = [
  'css/style.css',
  'js/common.js',
  'images/login-bg.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHEABLE = /\.(?:css|js|svg|png|ico|woff2?)$/;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache business data
  if (!CACHEABLE.test(url.pathname)) return; // let HTML navigations hit the network directly

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
