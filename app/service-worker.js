// Service worker: precarga todo en la instalación para que la app abra sin internet.
// Estrategia network-first: con conexión siempre se sirve (y se guarda) la versión más nueva,
// así que cada deploy llega solo; sin conexión se usa la copia guardada.
// Sube CACHE solo si cambia la lista de archivos (para limpiar copias viejas).
const CACHE = "blind-royale-v2";
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "privacidad.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "fonts/fonts.css",
  "fonts/big-shoulders-display-latin-ext-4c517c.woff2",
  "fonts/big-shoulders-display-latin-8a3351.woff2",
  "fonts/figtree-latin-ext-467cc9.woff2",
  "fonts/figtree-latin-3c512d.woff2",
  "fonts/schibsted-grotesk-latin-ext-d7a834.woff2",
  "fonts/schibsted-grotesk-latin-7170b6.woff2",
  "fonts/yellowtail-latin-ext-e20504.woff2",
  "fonts/yellowtail-latin-5af189.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() =>
      // ignoreSearch: "?v=…" u otros parámetros no deben romper el modo sin conexión
      caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
        .then(hit => hit || Response.error())
    )
  );
});
