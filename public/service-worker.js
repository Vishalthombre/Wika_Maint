const CACHE_NAME = "wika-static-v1";
const urlsToCache = [
  "/login",
  "/register",
  "/register/check",
  "/css/auth.css",
  "/css/register-id.css",
  "/images/user_bg.jpg",
  "/images/android-chrome-192x192.png",
  "/images/android-chrome-512x512.png",
  "/js/register-sw.js",
  "/favicon.ico",
  "/manifest.json",
  "/offline.html" // 👈 Important: add this
];

// INSTALL
self.addEventListener("install", (event) => {
  console.log("✅ Installing service worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((err) => {
        console.error("❌ Cache failed:", err);
      });
    })
  );
  self.skipWaiting();
});

// ACTIVATE: Clean old caches (optional, but good)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request).catch(() => {
        // Fallback only for navigation (HTML pages)
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
      });
    })
  );
});
