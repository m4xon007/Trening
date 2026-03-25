// service-worker.js
// Trening PWA — offline cache
// Zmień CACHE_VERSION przy każdym deployu żeby wymusić odświeżenie cache

const CACHE_VERSION = 'trening-v1';
const CACHE_NAME = CACHE_VERSION;

// Zasoby do pre-cache przy instalacji
const PRECACHE_URLS = [
  '/Trening/',
  '/Trening/index.html',
  '/Trening/manifest.json',
  '/Trening/icons/icon-192.png',
  '/Trening/icons/icon-512.png',
];

// CDN zasoby — cache przy pierwszym użyciu (nie blokuj instalacji)
const CDN_CACHE_NAME = 'trening-cdn-v1';

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // aktywuj od razu bez czekania na zamknięcie kart
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== CDN_CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim()) // przejmij wszystkie otwarte karty
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignoruj nie-GET i chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // CDN (fonts.googleapis.com, cdn.jsdelivr.net, cdnjs itp.) —
  // Strategia: Stale-While-Revalidate
  const isCDN = (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('unpkg.com')
  );

  if (isCDN) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE_NAME));
    return;
  }

  // Wszystko inne (zasoby lokalne) — Strategia: Cache First, fallback sieć
  event.respondWith(cacheFirst(request, CACHE_NAME));
});

// ─── Strategie ─────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline fallback — zwróć główną stronę dla nawigacji
    if (request.mode === 'navigate') {
      const cache = await caches.open(cacheName);
      return cache.match('/Trening/') || cache.match('/Trening/index.html');
    }
    return new Response('Brak połączenia', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  return cached || fetchPromise;
}
