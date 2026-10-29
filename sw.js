/* EGO service worker: оболочка приложения доступна офлайн.
 *
 * Стратегия:
 *  - навигация (HTML) — network-first, при обрыве отдаём закэшированную оболочку;
 *  - статика своего origin — stale-while-revalidate, чтобы уроки открывались
 *    мгновенно и без сети.
 */

const VERSION = 'ego-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll([SHELL_URL, '/manifest.webmanifest', '/icons/icon-192.png']);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML — network-first с офлайн-фолбэком на оболочку.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(SHELL_URL, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(SHELL_URL)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Статика — stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached ?? (await network) ?? Response.error();
    })(),
  );
});
