// Service Worker for DaroshenasiAi (داروشناسیAi)
// Handles offline caching of app shell, CDN dependencies, static drug references, and notifications.

const CACHE_NAME = 'daroshenasi-v1.1.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icon-192.png',
  './icon-512.png'
];

// Installation: Cache core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline shell and assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activation: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Notification click event handler: Focus window when user taps medication reminder
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

// Fetch: Stale-while-revalidate for CDN & cached assets, Network-only with offline fallback for APIs
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // DeepSeek / External AI API calls - Network first with friendly offline JSON fallback
  if (url.origin.includes('deepseek.com')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'خطا در برقراری ارتباط با دیپسیک: اینترنت قطع است یا دسترسی به سرور مقدور نیست.',
              type: 'offline_network_error',
              code: 'offline'
            }
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }
        );
      })
    );
    return;
  }

  // Static assets & CDN libraries: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // Silent catch in offline mode
        });
        return cachedResponse;
      }

      // Not in cache: fetch from network and cache successful GET responses
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || request.method !== 'GET') {
          return networkResponse;
        }

        // Cache external scripts/fonts (Tailwind, Lucide, Fonts)
        if (
          url.origin.includes('cdn') ||
          url.origin.includes('unpkg.com') ||
          url.origin.includes('jsdelivr.net') ||
          url.origin.includes('fonts') ||
          request.url.startsWith(self.location.origin)
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return networkResponse;
      }).catch((error) => {
        // Fallback to cached index.html for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw error;
      });
    })
  );
});
