import { createJournalCache } from '../../../packages/engines/mausbot/src/journal-cache.mjs';
type Root = { cacheVersion: number; scope: string; epoch: string; editions: unknown[]; queue: unknown[]; preferences: Record<string, unknown> } | null;
const FALLBACK = 'atlas.journal.cache.v2';
export async function journalCacheStorage() {
  let db: IDBDatabase | null = null;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('atlas-journal-v2', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('cache');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch { /* Small localStorage fallback when IDB is denied. */ }
  const adapter = { update<T>(transform: (root: Root) => [Root, T]): Promise<T> {
    if (!db) return new Promise((resolve, reject) => {
      try {
        const [root, result] = transform(JSON.parse(localStorage.getItem(FALLBACK) ?? 'null'));
        const text = JSON.stringify(root);
        if (text.length > 250000) throw new Error('Journal fallback full');
        if (root) localStorage.setItem(FALLBACK, text); else localStorage.removeItem(FALLBACK);
        resolve(result);
      } catch (error) { reject(error); }
    });
    return new Promise((resolve,reject) => {
      const tx = db!.transaction('cache','readwrite'); const store = tx.objectStore('cache');
      let result: T;
      const request = store.get('root');
      request.onsuccess = () => { try { const [root, value] = transform(request.result ?? null); result = value; if (root) store.put(root,'root'); else store.delete('root'); } catch { tx.abort(); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Journal cache transaction failed'));
    });
  } };
  return { cache: createJournalCache(adapter), scope: () => adapter.update(root => [root, root?.scope ?? null]), close: () => db?.close() };
}
export async function purgeJournalCache() {
  const storage = await journalCacheStorage();
  try { await storage.cache.purge(); localStorage.removeItem(FALLBACK); } finally { storage.close(); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage({ type: 'journal:clear' });
  if ('caches' in window) for (const key of await caches.keys()) if (key.startsWith('atlas-journal')) await caches.delete(key);
  window.dispatchEvent(new Event('journal:purged'));
  localStorage.setItem('atlas.journal.purge', crypto.randomUUID());
}

export async function cachedJournalWorkspace(userId: string) {
  const storage = await journalCacheStorage();
  try { const scope = await storage.scope(); const pair = scope ? JSON.parse(scope) : null; return pair?.[0] === userId ? pair[1] as string : null; }
  finally { storage.close(); }
}
