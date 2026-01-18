// Service Worker for Push Notifications, Offline Support, and iOS Audio Caching - v0.14
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

// Audio file extensions for iOS caching
const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.m4a', '.aac', '.ogg', '.wav'];

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker v0.14 installed');
  
  event.waitUntil(
    Promise.all([
      // Clear old caches (except audio cache to preserve preloaded tracks)
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

// Helper to check if URL is an audio file
const isAudioFile = (url) => {
  const pathname = new URL(url).pathname.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => pathname.endsWith(ext));
};

// Message handler for iOS audio preloading
self.addEventListener('message', (event) => {
  const { type, urls, url } = event.data || {};
  
  if (type === 'PRELOAD_AUDIO' && Array.isArray(urls)) {
    console.log('[SW] Preloading audio tracks:', urls.length);
    
    caches.open(AUDIO_CACHE).then((cache) => {
      let loaded = 0;
      const total = urls.length;
      
      urls.forEach((audioUrl, index) => {
        fetch(audioUrl, { mode: 'cors', credentials: 'omit' })
          .then((response) => {
            if (response.ok) {
              cache.put(audioUrl, response);
              loaded++;
              console.log(`[SW] Cached audio ${loaded}/${total}`);
              
              // Notify all clients of progress
              self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                  client.postMessage({
                    type: 'AUDIO_PRELOAD_PROGRESS',
                    loaded,
                    total,
                  });
                });
              });
            }
          })
          .catch((err) => {
            console.log('[SW] Failed to preload audio:', audioUrl, err);
          });
      });
    });
  }
  
  if (type === 'CACHE_AUDIO' && url) {
    console.log('[SW] Caching single audio:', url);
    caches.open(AUDIO_CACHE).then((cache) => {
      fetch(url, { mode: 'cors', credentials: 'omit' })
        .then((response) => {
          if (response.ok) {
            cache.put(url, response);
            console.log('[SW] Audio cached successfully');
          }
        })
        .catch((err) => console.log('[SW] Failed to cache audio:', err));
    });
  }
  
  if (type === 'CLEAR_AUDIO_CACHE') {
    console.log('[SW] Clearing audio cache');
    caches.delete(AUDIO_CACHE).then(() => {
      console.log('[SW] Audio cache cleared');
    });
  }
  
  if (type === 'GET_AUDIO_CACHE_SIZE') {
    caches.open(AUDIO_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        event.source.postMessage({
          type: 'AUDIO_CACHE_SIZE',
          count: keys.length,
        });
      });
    });
  }
});

// Fetch handler with network-first for HTML, cache-first for assets and audio
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Handle audio files - cache-first strategy for iOS background playback
  if (isAudioFile(request.url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Audio cache hit:', url.pathname);
          return cachedResponse;
        }
        
        // Fetch from network and cache
        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(AUDIO_CACHE).then((cache) => {
              cache.put(request, responseToCache);
              console.log('[SW] Audio cached on fetch:', url.pathname);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
  
  // Skip external requests (except for audio which is handled above)
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
