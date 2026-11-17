// Recipe Box offline support.
// The app's own files are cached so it opens with no signal. Recipes, photos,
// the shopping list and timers live on the phone (localStorage / IndexedDB), not here.
const CACHE = "recipebox-v4";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
const NET_TIMEOUT = 3500; // weak signal: fall back to the saved copy instead of hanging

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

function withTimeout(p, ms){
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy so the app looks the same offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }
      catch (_) { return new Response("", { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // App files: try the network (to pick up updates), fall back to the saved copy.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await withTimeout(fetch(req), NET_TIMEOUT);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch (_) {
      return (await c.match(req, { ignoreSearch: true })) ||
             (req.mode === "navigate" ? await c.match("index.html") : undefined) ||
             new Response("Offline", { status: 503 });
    }
  })());
});
