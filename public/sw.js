// ============================================================
// NEXUS service worker (Part 29-33).
//
// Deliberately minimal for a Firestore-realtime app: nothing here
// caches API responses or Firestore data (that would show stale
// school data, which this project treats as worse than no offline
// support at all). It only precaches the static app shell so a
// flaky connection doesn't produce a blank white screen, and falls
// back to a cached shell for navigations when the network is down.
// ============================================================
const CACHE_NAME = "nexus-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes

  // Never cache API/Firestore-adjacent calls — those must always hit
  // the network so data is never stale.
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((res) => res || caches.match(request)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(() => cached))
  );
});
