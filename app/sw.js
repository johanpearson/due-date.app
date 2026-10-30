// Offline cache for the app shell, plus best-effort visit reminders.
const VERSION = 'v1';
const SHELL = `due-date-shell-${VERSION}`;
const DATA = 'due-date-data';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'calc.js',
  'store.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const TYPE_NAMES = { midwife: 'Barnmorska', ultrasound: 'Ultraljud', doctor: 'Läkare', other: 'Besök' };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('due-date-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const network = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'check-reminders') event.waitUntil(checkReminders());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'visit-reminders') event.waitUntil(checkReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./#/besok');
  })());
});

function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function readJson(cache, url, fallback) {
  const res = await cache.match(url);
  if (!res) return fallback;
  try { return await res.json(); } catch { return fallback; }
}

// Notifies once per visit when it is today or tomorrow.
async function checkReminders() {
  if (self.Notification && Notification.permission !== 'granted') return;
  const cache = await caches.open(DATA);
  const data = await readJson(cache, '__data.json', null);
  if (!data || !data.notify) return;
  const notified = new Set(await readJson(cache, '__notified.json', []));
  const now = new Date();
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  for (const v of data.visits || []) {
    if (v.date !== today && v.date !== tomorrow) continue;
    const key = `${v.id}@${v.date}`;
    if (notified.has(key)) continue;
    const title = (v.title && v.title.trim()) || TYPE_NAMES[v.type] || 'Besök';
    const when = `${v.date === today ? 'Idag' : 'Imorgon'}${v.time ? ` kl ${v.time}` : ''}`;
    await self.registration.showNotification(title, {
      body: [when, v.place].filter(Boolean).join(' · '),
      tag: key,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      lang: 'sv',
    });
    notified.add(key);
  }
  // Keep only keys for visits that are not in the past.
  const kept = [...notified].filter((k) => k.split('@')[1] >= today);
  await cache.put('__notified.json', new Response(JSON.stringify(kept), { headers: { 'Content-Type': 'application/json' } }));
}
