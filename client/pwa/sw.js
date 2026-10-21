// ─────────────────────────────────────────────────────────────
//  SERVICE WORKER de Arena Royale (app instalable y arranque sin red).
//  Es una plantilla: al compilar, vite.config.ts rellena VERSION y PRECACHE y la publica
//  como sw.js. En desarrollo no se registra.
//  - Precarga: index, el código compilado, el manifest, los iconos y los sprites (gen/), para
//    poder jugar una partida de práctica sin red desde la primera vez.
//  - Al vuelo: audio y fuentes de Google; se guardan la primera vez que se piden y se
//    refrescan por detrás.
//  - Nunca toca la API ni el servidor de juego (otro origen o /api, /matchmake).
//  Cada versión nueva usa cachés nuevas y borra las de la anterior.
// ─────────────────────────────────────────────────────────────

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const PRECACHED = new Set(PRECACHE);
const SHELL = `arena-shell-${VERSION}`;
const RUNTIME = `arena-runtime-${VERSION}`;
const FONTS = 'arena-fonts';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// los servidores suelen responder con «Vary: Origin» y los scripts de módulo llevan Origin:
// sin esto, lo precargado (pedido sin Origin) no casaría
const MATCH = { ignoreVary: true };

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('arena-') && k !== SHELL && k !== RUNTIME && k !== FONTS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // la música va por <audio> con peticiones parciales (Range): mejor directo a la red
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(req, FONTS));
  if (url.origin !== self.location.origin) return;
  const base = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(base)) return;
  const path = url.pathname.slice(base.length);
  if (path === 'sw.js' || /^(api|matchmake|colyseus)(\/|$)/.test(path)) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  // lo precargado no cambia dentro de una versión (su contenido entra en VERSION) y lo que
  // lleva hash en el nombre, nunca
  if (PRECACHED.has(path) || path.startsWith('assets/')) return e.respondWith(cacheFirst(req));
  e.respondWith(staleWhileRevalidate(req, RUNTIME));
});

/** La página: siempre la última si hay red; sin red, la guardada. */
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL)).put('./', res.clone());
    return res;
  } catch {
    return (await caches.match('./', MATCH)) || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, MATCH);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}
