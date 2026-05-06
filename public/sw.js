const CACHE_NAME = 'luna-cache-v4';
const APP_SHELL = ['/', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (req.mode === 'navigate' || APP_SHELL.includes(url.pathname)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Luna app', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Luna app 💊';
  const bracket = data.bracket || null;
  const actions = bracket ? [{ action: 'taken', title: 'Genomen ✓' }] : [];
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'luna-reminder',
    renotify: true,
    actions,
    data: { url: data.url || '/', bracket },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

async function focusOrOpen(targetUrl) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of wins) {
    try {
      const u = new URL(c.url);
      if (u.origin === self.location.origin && 'focus' in c) {
        c.navigate(targetUrl).catch(() => undefined);
        return c.focus();
      }
    } catch (_e) {}
  }
  return self.clients.openWindow(targetUrl);
}

async function showConfirmation(count) {
  const body = count > 0
    ? `${count} medicij${count === 1 ? 'n' : 'nen'} ingelogd. Goed gedaan! 💙`
    : 'Was al ingelogd. 💙';
  await self.registration.showNotification('Goed gedaan! 💙', {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'luna-confirm',
    renotify: false,
  });
  setTimeout(async () => {
    const notes = await self.registration.getNotifications({ tag: 'luna-confirm' });
    notes.forEach((n) => n.close());
  }, 3000);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  if (event.action === 'taken' && data.bracket) {
    event.waitUntil(
      fetch('/api/push/mark-taken', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bracket: data.bracket }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('mark-taken faalde');
          const body = await res.json().catch(() => ({}));
          const logged = Array.isArray(body.logged) ? body.logged.length : 0;
          await showConfirmation(logged);
        })
        .catch(() => focusOrOpen(targetUrl)),
    );
    return;
  }

  event.waitUntil(focusOrOpen(targetUrl));
});
