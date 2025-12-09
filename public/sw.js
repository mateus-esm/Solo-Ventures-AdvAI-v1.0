// Service Worker for AdvAI Portal PWA
const CACHE_NAME = 'advai-portal-v13-1209';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/solo-ventures-icon-192.png',
  '/solo-ventures-icon-512.png',
];

// URLs que NÃO devem ser cacheadas (módulos Vite)
const shouldNotCache = (url) => {
  return url.includes('/node_modules/.vite/') || 
         url.includes('/@vite/') ||
         url.includes('/@react-refresh') ||
         url.includes('/__vite_ping');
};

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete ALL old caches immediately
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => {
        console.log('[SW] New service worker installed, skipping waiting...');
        return self.skipWaiting();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // NEVER cache Vite dev modules
  if (shouldNotCache(event.request.url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Don't cache Vite modules
          if (shouldNotCache(event.request.url)) {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Taking control of all clients...');
        return self.clients.claim();
      })
      .then(() => {
        // Force refresh all clients
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            console.log('[SW] Reloading client:', client.url);
            client.postMessage({ type: 'CACHE_UPDATED' });
          });
        });
      })
  );
});
