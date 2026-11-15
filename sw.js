/* Mi Día — permite abrir la app sin conexión.
   Estrategia: siempre se intenta la red primero (así las actualizaciones
   llegan solas) y, si no hay conexión, se usa la última copia guardada. */
const CACHE = 'midia-v1';
const SHELL = [
  './', 'index.html', 'manifest.json', 'icon.svg',
  'css/styles.css',
  'js/config.js', 'js/store.js', 'js/views.js', 'js/sync.js', 'js/app.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const own = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || (!own && !sdk)) return;   // datos, portadas, etc. van directos a la red
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
