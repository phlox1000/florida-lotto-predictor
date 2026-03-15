// ─── Version & Cache ────────────────────────────────────────────────────────
// Bump this on every deploy so the SW lifecycle triggers an update.
const APP_VERSION = '4.2.0';
const CACHE_NAME = `fl-lotto-oracle-v${APP_VERSION}`;
const STATIC_ASSETS = ['/', '/manifest.json'];

// ─── Install ────────────────────────────────────────────────────────────────
// Cache shell assets but do NOT skipWaiting automatically.
// We wait for the client to send a SKIP_WAITING message after user confirms.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Do NOT call self.skipWaiting() here — let the update prompt control it
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Clean old caches and claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients that the new version is now active
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION });
          });
        });
      })
  );
});

// ─── Message handler ────────────────────────────────────────────────────────
// Listen for SKIP_WAITING from the client when user clicks "Update Now"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
});

// ─── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const iconUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031884010/6J86Kiyju8nzk4hczi9dXp/pwa-icon-192-gVgtM7zTtpdrwJRZVgEdKA.png';
  let data = { title: 'FL Lotto Oracle', body: 'New update available', icon: iconUrl };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || iconUrl,
    badge: iconUrl,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ─── Fetch: Network-first for everything ────────────────────────────────────
// HTML navigations and API calls always go to network first.
// Static assets (JS/CSS/images) also use network-first with cache fallback.
// This ensures users always get the latest content.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests entirely (POST, PUT, etc.)
  if (request.method !== 'GET') return;

  // Skip API/tRPC requests — let them go straight to network with no caching
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for all same-origin GET requests
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
