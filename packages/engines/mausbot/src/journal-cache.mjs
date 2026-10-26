import { validateJournalProgressInput, validateJournalStateInput } from './journal-source.mjs';
export const CACHE_VERSION = 2;
export const SOFT_TTL_MS = 60000;
export const MAX_CACHE_BYTES = 2 * 1024 * 1024;
export function journalCacheScope(userId, workspaceId) {
  if (!userId || !workspaceId) throw new Error('Journal scope required');
  return JSON.stringify([userId, workspaceId]);
}
export function journalCacheKey(userId, workspaceId, editionId) { return JSON.stringify([CACHE_VERSION, userId, workspaceId, editionId]); }
export function cacheIsStale(entry, now) { return !entry || now - entry.savedAt >= SOFT_TTL_MS; }
export function mergeJournalPayload(previous, incoming, queue = []) {
  const overrides = new Map(queue.filter(q => q.kind === 'state').map(q => [JSON.stringify([q.body.editionId, q.body.itemId]), q.body.status]));
  const old = new Map((previous?.items ?? []).map(i => [i.key, i]));
  return { ...incoming, items: incoming.items.map(i => {
    const next = overrides.has(i.key) ? { ...i, state: overrides.get(i.key) } : i;
    const before = old.get(i.key);
    return before && JSON.stringify(before) === JSON.stringify(next) ? before : next;
  }) };
}
export function trimJournalEditions(editions, now) {
  const kept = editions.filter(e => e.cacheVersion === CACHE_VERSION && now - e.savedAt <= 7 * 86400000)
    .sort((a,b) => b.savedAt-a.savedAt).slice(0,7);
  while (kept.length && new TextEncoder().encode(JSON.stringify(kept)).length > MAX_CACHE_BYTES) kept.pop();
  return kept;
}
export function safeCachedPayload(payload, now) {
  const valid = Date.parse(payload.coverExpiresAt ?? '') > now + 60000;
  return { ...payload, offline: true, items: payload.items.map(i => valid ? i : { ...i, coverUrl: null }) };
}
/** Adapter.update is an atomic transaction over one root record (IndexedDB in production). */
export function createJournalCache(adapter) {
  const valid = (root, token) => root?.cacheVersion === CACHE_VERSION && root.scope === token.scope && root.epoch === token.epoch;
  return {
    async open(scope) {
      return adapter.update(root => {
        if (root?.cacheVersion !== CACHE_VERSION || root.scope !== scope) root = { cacheVersion: CACHE_VERSION, scope, epoch: crypto.randomUUID(), editions: [], queue: [], preferences: {} };
        return [root, { scope, epoch: root.epoch }];
      });
    },
    async snapshot(token) { return adapter.update(root => [root, valid(root,token) ? structuredClone(root) : null]); },
    async save(token, payload, etag, now) {
      return adapter.update(root => {
        if (!valid(root,token)) return [root,false];
        const entry = { cacheVersion: CACHE_VERSION, key: JSON.stringify([token.scope,payload.editionId]), savedAt: now, etag, payload };
        root.editions = trimJournalEditions([entry, ...root.editions.filter(e => e.key !== entry.key)], now);
        return [root,true];
      });
    },
    async enqueue(token, operation) {
      return adapter.update(root => {
        if (!valid(root,token)) throw new Error('Journal scope changed');
        if (root.queue.length >= 100) throw new Error('Journal offline queue full');
        const workspace = JSON.parse(token.scope)[1];
        const input = operation.kind === 'progress' ? validateJournalProgressInput(operation.body) : operation.kind === 'state' ? validateJournalStateInput(operation.body) : null;
        if (!input || input.workspaceId !== workspace || typeof operation.id !== 'string' || operation.id.length > 128 || !operation.id || (operation.kind === 'progress' && operation.id !== input.batchId)) throw new Error('Invalid queued operation');
        const previous = root.queue.find(q => q.id === operation.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(operation)) throw new Error('Queued id conflict');
        if (!previous) root.queue.push(structuredClone(operation));
        return [root,true];
      });
    },
    async acknowledge(token, id) {
      return adapter.update(root => { if (valid(root,token)) root.queue = root.queue.filter(q => q.id !== id); return [root,null]; });
    },
    async preferences(token, values) {
      return adapter.update(root => { if (valid(root,token)) root.preferences = { ...root.preferences, ...values }; return [root,null]; });
    },
    async purge() { return adapter.update(() => [null,null]); },
  };
}
