/* GH — service worker : cache « app shell » en cache-first pour fonctionner hors-ligne.
   Incrémenter CACHE à chaque déploiement (les anciens caches sont purgés au activate). */
const CACHE = 'gh-shell-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './sons/son-start.mp3',
  './sons/son-phase.m4a',
  './sons/son-double.mp3',
  './sons/son-etoile.mp3',
  './sons/son-verte.mp3',
  './sons/son-rouge.mp3',
  './sons/son-noire.mp3',
  './sons/son-stop.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => { /* pré-cache partiel : le réseau servira de secours */ })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Android share_target : « Partager → GH » depuis une capture d'offre → image à analyser
  if (e.request.method === 'POST' && url.searchParams.get('share') === 'image') {
    // (branche POST : ne pas return avant respondWith)
    e.respondWith(Response.redirect('./index.html?share=image'));
    e.waitUntil((async () => {
      try {
        const data = await e.request.formData();
        const file = data.get('media');
        const client = await self.clients.get(e.resultingClientId);
        if (client && file && file.size) client.postMessage({ type: 'share-image', file });
      } catch (err) { /* ignore */ }
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // jamais de cache cross-origin
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => {
        // hors-ligne et pas en cache : pour une navigation, renvoyer l'app shell
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
