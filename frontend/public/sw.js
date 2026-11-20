// SaansSafe service worker: keeps the app shell and the last air reading available offline.
// SOS phone numbers live in localStorage, so the SOS panel works offline too.
const SHELL = "saanssafe-shell-v1";
const DATA = "saanssafe-data-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(["/", "/favicon.svg"])));
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

  // App shell: stale-while-revalidate.
  event.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => hit || cache.match("/"));
        return hit || network;
      }),
    ),
  );
});
