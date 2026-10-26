importScripts("/journal-sw-core.js");
const CACHE_NAME = "atlas-hq-v4";
const APP_SHELL = ["/manifest.webmanifest", "/journal.webmanifest", "/icon.svg", "/apple-touch-icon.png", "/journal-sw-core.js", "/journal-offline.html", "/journal-offline.js", "/journal-offline.css"];
const J = self.JournalSwCore;
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never cache authenticated HTML or API responses. IndexedDB is scoped by user/workspace.
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => J.isJournalPage(url) ? (await caches.match('/journal-offline.html')) || Response.error() : Response.error()));
    return;
  }
  if (!APP_SHELL.includes(url.pathname) && !url.pathname.startsWith('/_next/static/')) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    const update = fetch(request).then(async response => { if(response.ok) { await cache.put(request,response.clone()); const keys=await cache.keys(); for(const r of keys.slice(0,Math.max(0,keys.length-150))) await cache.delete(r); } return response; });
    if(cached) { event.waitUntil(update.catch(()=>undefined)); return cached; }
    return update;
  }));
});
self.addEventListener('message', event => {
  if(event.data?.type === 'journal:clear') event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('atlas-journal')).map(key=>caches.delete(key)))));
});
