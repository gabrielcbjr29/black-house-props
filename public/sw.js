// Service worker: o app abre mesmo sem internet. Busca sempre a versão nova na rede e,
// se não houver conexão, usa a última guardada (interface e dados do dia).
const CACHE = 'blackhouse-v10';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'engine.js', 'tips.js', 'share.js', 'importer.js', 'icon.svg', 'manifest.webmanifest', 'fonts/archivo.woff2', 'fonts/bigshoulders.woff2', 'fonts/manrope.woff2', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
