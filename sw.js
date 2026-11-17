/* Mi Día — permite abrir la app sin conexión.
   Estrategia: siempre se intenta la red primero (así las actualizaciones
   llegan solas) y, si no hay conexión, se usa la última copia guardada. */
const CACHE = 'midia-v7';
const SHELL = [
  './', 'index.html', 'manifest.json', 'icon.svg',
  'styles.css',
  'config.js', 'store.js', 'views.js', 'sync.js', 'push.js', 'google.js', 'app.js',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Llega un aviso desde el servidor: mostrarlo como notificación */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const options = { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' } };
  if (d.tag) options.tag = d.tag;
  e.waitUntil(self.registration.showNotification(d.title || 'Mi Día', options));
});

/* Al tocar la notificación: abrir la app (o traerla al frente si ya está abierta) */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    if (!open) return self.clients.openWindow(url);
    /* Si el aviso lleva a una sección concreta (p. ej. #sugerencias), ir allí */
    return open.focus().then(c => (url.includes('#') && c && 'navigate' in c ? c.navigate(url) : c));
  }));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const own = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || (!own && !sdk)) return;   // datos, portadas, etc. van directos a la red
  /* Los archivos de la app se comprueban siempre con el servidor (sin usar la copia de 10 min
     del navegador), para que una versión nueva llegue en cuanto se publica */
  e.respondWith(
    fetch(own ? new Request(e.request, { cache: 'no-cache' }) : e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
