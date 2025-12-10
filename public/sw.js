// Service Worker for AdvAI Portal PWA - Aggressive Cache Clear
const CACHE_NAME = 'advai-portal-v23-' + Date.now();
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/solo-ventures-icon-192.png',
  '/solo-ventures-icon-512.png',
];

// URLs que NUNCA devem ser cacheadas
const shouldNotCache = (url) => {
  return url.includes('/node_modules/') || 
         url.includes('/.vite/') ||
         url.includes('/@vite/') ||
         url.includes('/@react-refresh') ||
         url.includes('/__vite_ping') ||
         url.includes('.js?v=') ||
         url.includes('chunk-');
};

// Install event - clear ALL caches and skip waiting
self.addEventListener('install', (event) => {
  console.log('[SW] Installing, clearing all caches...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Fetch event - network first for JS, cache for static assets only
self.addEventListener('fetch', (event) => {
  // NEVER cache JS modules
  if (shouldNotCache(event.request.url) || event.request.url.endsWith('.js')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // For static assets, try network first then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && !shouldNotCache(event.request.url)) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Activate event - immediately take control
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating, purging old caches...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.filter(name => name !== CACHE_NAME).map(name => {
            console.log('[SW] Purging:', name);
            return caches.delete(name);
          })
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        self.clients.matchAll().then((clients) => {
          clients.forEach(client => client.postMessage({ type: 'CACHE_UPDATED' }));
        });
      })
  );
});