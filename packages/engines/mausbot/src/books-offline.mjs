export const BOOK_CACHE_VERSION = 1;
export const MAX_OFFLINE_BYTES = 1_000_000_000;
export const MAX_OFFLINE_QUEUE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bookCacheScope(userId, workspaceId) {
  if (!UUID.test(userId ?? '') || !UUID.test(workspaceId ?? '')) throw new Error('BOOK_CACHE_SCOPE_INVALID');
  return JSON.stringify([userId.toLowerCase(), workspaceId.toLowerCase()]);
}

export function safeBookMetadata(book) {
  if (!book || !UUID.test(book.id ?? '') || !['epub', 'pdf'].includes(book.format)) throw new Error('BOOK_CACHE_METADATA_INVALID');
  return {
    id: book.id.toLowerCase(), title: String(book.title ?? '').slice(0, 300), author: String(book.author ?? '').slice(0, 300),
    format: book.format, status: ['active', 'finished', 'archived'].includes(book.status) ? book.status : 'active',
    position: Number.isFinite(book.position) ? Math.max(0, Math.min(1, book.position)) : 0,
    clientUpdatedAt: typeof book.clientUpdatedAt === 'string' ? book.clientUpdatedAt : null,
    deviceId: UUID.test(book.deviceId ?? '') ? book.deviceId.toLowerCase() : null,
    fileSize: Number.isSafeInteger(book.fileSize) && book.fileSize > 0 ? book.fileSize : null,
    checksum: /^[a-f0-9]{64}$/.test(book.checksum ?? '') ? book.checksum : null,
    coverThumbPath: typeof book.cover_thumb_path === 'string' ? book.cover_thumb_path : null,
    downloadedAt: Number.isFinite(book.downloadedAt) ? book.downloadedAt : null,
    lastOpenedAt: Number.isFinite(book.lastOpenedAt) ? book.lastOpenedAt : 0,
    localPosition: Number.isFinite(book.localPosition) ? Math.max(0, Math.min(1, book.localPosition)) : null,
    localDeviceId: UUID.test(book.localDeviceId ?? '') ? book.localDeviceId.toLowerCase() : null,
  };
}

export function validateBookQueueOperation(operation, workspaceId) {
  if (!operation || !['progress', 'annotation', 'annotation_delete'].includes(operation.kind) || !UUID.test(operation.sendId ?? '') || !operation.body || operation.body.workspaceId !== workspaceId || operation.body.sendId !== operation.sendId) return false;
  if (operation.kind === 'progress') {
    const events = operation.body.events;
    return Array.isArray(events) && events.length > 0 && events.length <= 20 && events.every(event => UUID.test(event.bookId ?? '') && Number.isInteger(event.deltaSeconds) && event.deltaSeconds >= 0 && event.deltaSeconds <= 120 && Number.isFinite(event.position) && event.position >= 0 && event.position <= 1 && UUID.test(event.deviceId ?? '') && typeof event.clientUpdatedAt === 'string');
  }
  const note = operation.body;
  if(operation.kind==='annotation_delete') return UUID.test(note.bookId ?? '') && UUID.test(note.id ?? '');
  return UUID.test(note.bookId ?? '') && ['note', 'highlight', 'bookmark'].includes(note.kind) && typeof note.body === 'string' && note.body.length > 0 && note.body.length <= 10000 && Number.isFinite(note.position) && note.position >= 0 && note.position <= 1 && ['yellow', 'blue', 'green', 'pink'].includes(note.color) && (note.anchorCfi === null || typeof note.anchorCfi === 'string' && note.anchorCfi.length <= 4000);
}

/** Adapter.update(scope, transform) must serialize root writes across tabs. Files live in a separate object store. */
export function createBooksOfflineCache(adapter) {
  const valid = (root, token) => root?.cacheVersion === BOOK_CACHE_VERSION && root.scope === token.scope && root.epoch === token.epoch;
  return {
    async open(userId, workspaceId) {
      const scope = bookCacheScope(userId, workspaceId);
      return adapter.update(scope, root => {
        if (root?.cacheVersion !== BOOK_CACHE_VERSION || root.scope !== scope) root = { cacheVersion: BOOK_CACHE_VERSION, scope, epoch: crypto.randomUUID(), books: {}, queue: [] };
        return [root, { scope, epoch: root.epoch, userId: userId.toLowerCase(), workspaceId: workspaceId.toLowerCase() }];
      });
    },
    async snapshot(token) { return adapter.update(token.scope, root => [root, valid(root, token) ? structuredClone(root) : null]); },
    async saveBook(token, input) {
      const book = safeBookMetadata(input);
      return adapter.update(token.scope, root => { if (!valid(root, token)) return [root, false]; const prior=root.books[book.id]??{};root.books[book.id] = { ...prior, ...book, localPosition:book.localPosition??prior.localPosition??0,localDeviceId:book.localDeviceId??prior.localDeviceId??null }; return [root, true]; });
    },
    async enqueue(token, operation) {
      return adapter.update(token.scope, root => {
        if (!valid(root, token) || !validateBookQueueOperation(operation, token.workspaceId)) throw new Error('BOOK_QUEUE_SCOPE_INVALID');
        const old = root.queue.find(item => item.sendId === operation.sendId);
        if (old) { if (JSON.stringify(old) !== JSON.stringify(operation)) throw new Error('BOOK_QUEUE_SEND_ID_CONFLICT'); return [root, false]; }
        if (root.queue.length >= MAX_OFFLINE_QUEUE) throw new Error('BOOK_QUEUE_FULL');
        root.queue.push(structuredClone(operation));
        return [root, true];
      });
    },
    async queue(token) { return adapter.update(token.scope, root => [root, valid(root, token) ? structuredClone(root.queue).sort((a,b) => a.queuedAt-b.queuedAt) : null]); },
    async acknowledge(token, sendId) { return adapter.update(token.scope, root => { if (valid(root, token)) root.queue = root.queue.filter(item => item.sendId !== sendId); return [root, null]; }); },
    async markOpened(token, bookId, at = Date.now()) { return adapter.update(token.scope, root => { if (valid(root, token) && root.books[bookId]) root.books[bookId].lastOpenedAt = at; return [root, null]; }); },
    async purge() { await adapter.clear(); },
  };
}
