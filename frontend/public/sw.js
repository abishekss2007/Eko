// SaansSafe service worker: keeps the app shell and the last air reading available offline.
// SOS phone numbers live in localStorage, so the SOS panel works offline too.
// Bump these names whenever caching rules change: activate() deletes every other cache.
const SHELL = "saanssafe-shell-v3";
const DATA = "saanssafe-data-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(["/", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/air") {
    // Network first; on failure serve the most recent reading for any location.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA).then((cache) => cache.put("/api/air/last", copy));
          }
          return response;
        })
        .catch(() => caches.match("/api/air/last").then((hit) => hit || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Pages (/, /login, /signup, /app): network first, so a new build shows up on the next load.
  // The cached copy is only an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
    return;
  }

  // Hashed build assets never change under the same name: cache first is safe.
  event.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }),
      ),
    ),
  );
});
