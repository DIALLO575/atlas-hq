import { createBooksOfflineCache } from './books-offline-cache.mjs';

const DB_NAME = 'atlas-books-offline-v1';
const CAPABILITY_KEY = 'atlas.books.offline-capability';
const PREFIX = 'atlas.books.purge';
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('roots')) db.createObjectStore('roots');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers');
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error('BOOK_CACHE_UNAVAILABLE'));
  });
}

export async function booksOfflineStorage() {
  const db = await openDb();
  const adapter = {
    update(scope, transform) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('roots', 'readwrite'); const store = tx.objectStore('roots'); let result;
        const request = store.get(scope);
        request.onsuccess = () => {
          try { const [root, value] = transform(request.result ?? null); result = value; if (root) store.put(root, scope); else store.delete(scope); }
          catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('BOOK_CACHE_TRANSACTION_FAILED'));
      });
    },
    putFile(scope, bookId, value) { return requestWrite('files', `${scope}\u001f${bookId}`, value); },
    getFile(scope, bookId) { return requestRead('files', `${scope}\u001f${bookId}`); },
    deleteFile(scope, bookId) { return requestDelete('files', `${scope}\u001f${bookId}`); },
    putCover(scope, bookId, path, blob) { return requestWrite('covers', `${scope}\u001f${bookId}\u001f${path}`, blob); },
    getCover(scope, bookId, path) { return requestRead('covers', `${scope}\u001f${bookId}\u001f${path}`); },
    clear() { return new Promise((resolve, reject) => { const tx = db.transaction(['roots','files','covers'], 'readwrite'); for (const name of ['roots','files','covers']) tx.objectStore(name).clear(); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('BOOK_CACHE_PURGE_FAILED')); }); },
  };
  function requestRead(storeName, key) {
    return new Promise((resolve, reject) => { const request = db.transaction(storeName).objectStore(storeName).get(key); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
  }
  function requestWrite(storeName, key, value) {
    return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(value, key); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('BOOK_CACHE_WRITE_FAILED')); });
  }
  function requestDelete(storeName, key) {
    return new Promise((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(key); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('BOOK_CACHE_DELETE_FAILED')); });
  }
  const cache = createBooksOfflineCache(adapter);
  return {
    cache,
    close: () => db.close(),
    async getFile(token, bookId) { const root = await cache.snapshot(token); if(!root?.books?.[bookId]?.downloadedAt)return null;const record=await adapter.getFile(token.scope,bookId);if(!record?.blob||!record.checksum)return null;const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await record.blob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==record.checksum){await adapter.deleteFile(token.scope,bookId);await cache.saveBook(token,{...root.books[bookId],downloadedAt:null,fileSize:null,checksum:null});return null;}return record; },
    async putFile(token, book, blob, checksum) {
      const root = await cache.snapshot(token); if (!root || !root.books[book.id]) throw new Error('BOOK_CACHE_SCOPE_CHANGED');
      await adapter.putFile(token.scope, book.id, { blob, checksum, size: blob.size, savedAt: Date.now() });
      const saved = await cache.saveBook(token, { ...root.books[book.id], ...book, downloadedAt: Date.now(), fileSize: blob.size, checksum });
      if (!saved) { await adapter.deleteFile(token.scope, book.id); throw new Error('BOOK_CACHE_SCOPE_CHANGED'); }
    },
    async removeFile(token, bookId) {
      await adapter.deleteFile(token.scope, bookId);
      const root = await cache.snapshot(token); const book = root?.books?.[bookId];
      if (book) await cache.saveBook(token, { ...book, downloadedAt: null, fileSize: null, checksum: null });
    },
    async putCover(token, bookId, path, blob) { if (!(await cache.snapshot(token))) throw new Error('BOOK_CACHE_SCOPE_CHANGED'); return adapter.putCover(token.scope, bookId, path, blob); },
    async getCover(token, bookId, path) { if (!(await cache.snapshot(token))) return null; return adapter.getCover(token.scope, bookId, path); },
  };
}

export function currentBooksCapability() {
  try { const value = JSON.parse(sessionStorage.getItem(CAPABILITY_KEY) ?? localStorage.getItem(CAPABILITY_KEY) ?? 'null'); return value && typeof value.scope === 'string' && typeof value.epoch === 'string' ? value : null; }
  catch { return null; }
}
export function setBooksCapability(token) { const value=JSON.stringify(token);sessionStorage.setItem(CAPABILITY_KEY,value);localStorage.setItem(CAPABILITY_KEY,value); }
export async function purgeBooksOfflineCache() {
  const storage = await booksOfflineStorage();
  try { await storage.cache.purge(); } finally { storage.close(); }
  await new Promise(resolve => { const request=indexedDB.deleteDatabase('atlas-books-covers'); request.onsuccess=request.onerror=request.onblocked=resolve; });
  sessionStorage.removeItem(CAPABILITY_KEY);localStorage.removeItem(CAPABILITY_KEY);
  localStorage.removeItem('atlas.books.scope');
  localStorage.setItem(PREFIX, crypto.randomUUID());
  if ('serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage({ type: 'books:clear' });
  window.dispatchEvent(new Event('books:purged'));
}
