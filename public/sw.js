/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

const CACHE = 'linmine-shell-v1';
const SHELL_PATHS = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL_PATHS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await discoverAndCacheAssets();
      await self.clients.claim();
    })(),
  );
});

async function discoverAndCacheAssets(): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    const root = await cache.match('./');
    if (!root) return;
    const html = await root.text();
    const refs = new Set<string>();
    for (const match of html.matchAll(/(?:href|src)="\.\/(assets\/[^"]+)"/g)) {
      refs.add('./' + match[1]);
    }
    if (refs.size === 0) return;
    await cache.addAll([...refs]);
  } catch {
    // best effort
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: false });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

export {};
