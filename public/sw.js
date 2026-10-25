importScripts("/journal-sw-core.js");
const CACHE_NAME = "atlas-hq-v3";
const APP_SHELL = ["/manifest.webmanifest", "/journal.webmanifest", "/icon.svg", "/apple-touch-icon.png", "/journal-sw-core.js"];
const J = self.JournalSwCore;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [CACHE_NAME, J.JOURNAL_CACHE];
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// Journal only: network first, keep the LAST successful response, serve it offline with expired signed URLs removed.
async function journalApi(request) {
  const cache = await caches.open(J.JOURNAL_CACHE);
  try {
    const response = await fetch(request);
    if (J.shouldStore(response)) {
      const old = await cache.keys();
      await Promise.all(old.filter((r) => new URL(r.url).pathname === J.API_PATH).map((r) => cache.delete(r)));
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (!cached) return new Response(JSON.stringify({ error: "OFFLINE" }), { status: 503, headers: { "Content-Type": "application/json" } });
    const body = J.sanitizeOffline(await cached.json(), Date.now());
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}
// The /journal page shell (no query) is the only HTML kept, so the journal opens offline. Other pages are never cached.
async function journalPage(request) {
  const cache = await caches.open(J.JOURNAL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put("/journal", response.clone());
    return response;
  } catch {
    return (await cache.match("/journal")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (J.isJournalApi(url)) { event.respondWith(journalApi(request)); return; }
  if (request.mode === "navigate") {
    if (J.isJournalPage(url)) { event.respondWith(journalPage(request)); return; }
    // Never cache authenticated HTML (other than the /journal shell above) or use it as an offline route fallback.
    event.respondWith(fetch(request));
    return;
  }
  const isPublicAsset = APP_SHELL.includes(url.pathname) || url.pathname.startsWith("/_next/static/");
  if (!isPublicAsset) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
    return response;
  })));
});

// Logout / account switch: the page can ask to wipe the journal cache.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "journal:clear") void caches.delete(J.JOURNAL_CACHE);
});
