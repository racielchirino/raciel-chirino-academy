// Raciel Chirino Academy — service worker
// Siempre pide la versión nueva a internet; la copia guardada solo se usa si no hay conexión.
const CACHE = 'rca-offline';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // Supabase, Google, videos y fuentes: directo a internet
  if (url.pathname.endsWith('/version.json')) return;   // el aviso de versión nunca se guarda
  if (url.pathname.startsWith('/api/')) return;         // la tasa del BCV siempre en vivo
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? './' : req, copy)); } return r; })
      .catch(() => caches.match(req.mode === 'navigate' ? './' : req).then(hit => hit || caches.match(req, { ignoreSearch: true })))
  );
});
