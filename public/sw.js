/**
 * Kairos service worker.
 *
 * Offline is not a nice-to-have for a calendar — checking what's next on a
 * train with no signal is a core use case. Kairos keeps all state in
 * localStorage, so if the shell loads, the app works: no network required for
 * anything except AI ingestion and cloud sync.
 *
 * Two strategies, chosen per request type:
 *
 *   Navigations   → network-first, cache fallback. You get fresh HTML when
 *                   online and the last good shell when not. Cache-first here
 *                   would strand users on a stale build after a deploy.
 *   Static assets → stale-while-revalidate. Instant paint from cache, quietly
 *                   refreshed in the background for the next load.
 *
 * API routes are never cached. A cached extraction result would be wrong, and
 * a cached failure would be worse.
 */

const VERSION = "kairos-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individual failures shouldn't abort the whole install.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // ---- navigations: network first ----------------------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/", { ignoreSearch: true });
          return (
            cached ??
            new Response(
              "<!doctype html><meta charset=utf-8><title>Offline</title>" +
                "<body style='background:#06070a;color:#edf1f7;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0'>" +
                "<p>Kairos is offline and hasn't been cached yet.</p>",
              { headers: { "Content-Type": "text/html" } },
            )
          );
        }),
    );
    return;
  }

  // ---- assets: stale-while-revalidate ------------------------------------
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
