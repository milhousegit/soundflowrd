// Service Worker for Push Notifications, Offline Support & Audio Caching - v0.14
const CACHE_NAME = 'soundflow-v0.14';
const APP_SHELL_CACHE = 'soundflow-app-shell-v0.14';
const AUDIO_CACHE = 'soundflow-audio-v1';

// App shell files to cache for offline access
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Dynamic assets that should be cached when fetched
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.woff2', '.woff', '.ttf', '.png', '.jpg', '.jpeg', '.svg', '.ico'];

// Audio file extensions to cache
const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.m4a', '.aac', '.ogg', '.wav'];

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker v0.14 installed');
  
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== APP_SHELL_CACHE && name !== AUDIO_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Cache app shell
      caches.open(APP_SHELL_CACHE).then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL_FILES).catch((err) => {
          console.log('[SW] Failed to cache some app shell files:', err);
        });
      }),
    ])
  );
  
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker v0.14 activated');
  event.waitUntil(clients.claim());
});

// Helper to check if URL should be cached
const shouldCache = (url) => {
  const pathname = new URL(url).pathname;
  return CACHEABLE_EXTENSIONS.some(ext => pathname.endsWith(ext)) || 
         pathname.includes('/assets/');
};

// Helper to check if URL is audio
const isAudioUrl = (url) => {
  const pathname = new URL(url).pathname.toLowerCase();
  // Check for audio extensions or streaming domains
  return AUDIO_EXTENSIONS.some(ext => pathname.includes(ext)) ||
         url.includes('cdn') ||
         url.includes('stream') ||
         url.includes('audio') ||
         url.includes('media');
};

// Listen for messages from the app (for audio caching)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_AUDIO') {
    const { url, trackId } = event.data;
    console.log('[SW] Caching audio for track:', trackId);
    
    event.waitUntil(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        try {
          // Check if already cached
          const existing = await cache.match(url);
          if (existing) {
            console.log('[SW] Audio already cached:', trackId);
            return;
          }
          
          // Fetch and cache
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            await cache.put(url, response.clone());
            console.log('[SW] Audio cached successfully:', trackId);
            
            // Notify the app
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'AUDIO_CACHED',
                trackId,
                url,
              });
            });
          }
        } catch (error) {
          console.log('[SW] Failed to cache audio:', trackId, error);
        }
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHED_AUDIO') {
    const { url } = event.data;
    
    event.waitUntil(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(url);
        const clients = await self.clients.matchAll();
        
        clients.forEach(client => {
          client.postMessage({
            type: 'CACHED_AUDIO_RESULT',
            url,
            isCached: !!cached,
          });
        });
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_AUDIO_CACHE') {
    console.log('[SW] Clearing audio cache');
    event.waitUntil(caches.delete(AUDIO_CACHE));
  }
});

// Fetch handler with network-first for HTML, cache-first for assets and audio
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Handle audio requests - cache first for instant playback
  if (isAudioUrl(request.url)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          console.log('[SW] Serving audio from cache');
          return cached;
        }
        
        // Not cached, fetch from network
        try {
          const response = await fetch(request);
          if (response.ok) {
            // Cache the audio for future use (clone response)
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch (error) {
          console.log('[SW] Audio fetch failed:', error);
          return new Response('Audio not available offline', { status: 503 });
        }
      })
    );
    return;
  }
  
  // Skip external requests (except audio which is handled above)
  if (!url.origin.includes(self.location.origin)) return;
  
  // Skip API and Supabase requests
  if (url.pathname.includes('/functions/') || 
      url.pathname.includes('/rest/') ||
      url.pathname.includes('/auth/') ||
      url.hostname.includes('supabase')) return;
  
  // For HTML requests (navigation), try network first, fallback to cache
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache the successful response
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline - return cached index.html
          console.log('[SW] Offline, serving cached index.html');
          return caches.match('/index.html').then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('/').then((rootResponse) => {
              if (rootResponse) {
                return rootResponse;
              }
              return new Response('Offline - App not cached', { 
                status: 503,
                headers: { 'Content-Type': 'text/html' }
              });
            });
          });
        })
    );
    return;
  }
  
  // For other assets, try cache first, then network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response and update cache in background
        fetch(request).then((networkResponse) => {
          if (networkResponse.ok && shouldCache(request.url)) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
      
      // Not in cache, fetch from network
      return fetch(request).then((networkResponse) => {
        // Cache static assets
        if (networkResponse.ok && shouldCache(request.url)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Asset not available offline
        console.log('[SW] Asset not available offline:', request.url);
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  
  let data = { title: 'Nuova uscita!', body: 'Un artista che segui ha pubblicato nuova musica.', url: '/' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: 'Apri' },
      { action: 'close', title: 'Chiudi' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
