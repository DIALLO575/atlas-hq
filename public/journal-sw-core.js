/* Pure journal offline logic, shared by /sw.js (importScripts) and node tests. No private data from other pages. */
(function (root) {
  var JOURNAL_CACHE = "atlas-journal-v1";
  var API_PATH = "/api/engines/mausbot/journal";
  function isJournalApi(url) { return url.pathname === API_PATH; }
  function isJournalPage(url) { return url.pathname === "/journal"; }
  /** Strip signed cover URLs that are expired (or will be within 60 s) and mark the payload as offline. */
  function sanitizeOffline(payload, nowMs) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) return null;
    var exp = Date.parse(payload.coverExpiresAt || "");
    var valid = Number.isFinite(exp) && exp - 60000 > nowMs;
    var items = payload.items.map(function (i) { var c = Object.assign({}, i); if (!valid) c.coverUrl = null; return c; });
    return Object.assign({}, payload, { items: items, offline: true });
  }
  /** Cache key ignores nothing: one entry per workspace query; older entries are pruned to keep only the last read edition. */
  function shouldStore(response) {
    if (!response || !response.ok) return false;
    var cc = (response.headers && response.headers.get && response.headers.get("Content-Type")) || "";
    return cc.indexOf("application/json") === 0;
  }
  var api = { JOURNAL_CACHE: JOURNAL_CACHE, API_PATH: API_PATH, isJournalApi: isJournalApi, isJournalPage: isJournalPage, sanitizeOffline: sanitizeOffline, shouldStore: shouldStore };
  root.JournalSwCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
