/* RadioHub minimal service worker: installable PWA, offline page untouched.
 * Cache-first only for the app shell navigation fallback is handled by nginx;
 * here we just take control immediately so `beforeinstallprompt` can fire. */
// Bump this whenever the shell must be refreshed: `activate` deletes every
// cache whose name differs, so old shells can never be served after a deploy.
const CACHE_NAME = 'radiohub-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigations: offline users still get the cached shell.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/').then((res) => res ?? fetch(event.request))),
    );
  }
});
