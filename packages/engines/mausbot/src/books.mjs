import { createHash } from 'node:crypto';
export const BOOK_FORMATS = Object.freeze({ epub: 'application/epub+zip', pdf: 'application/pdf' });
export const BOOK_FINISHED_THRESHOLD = 0.98;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isBookUuid(value) { return typeof value === 'string' && UUID.test(value); }
export function validateCreateBook(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { workspaceId, title, author = '', format, mimeType, byteSize } = value;
  if (!isBookUuid(workspaceId) || typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 300
    || typeof author !== 'string' || author.length > 300 || !Object.hasOwn(BOOK_FORMATS, format)
    || mimeType !== BOOK_FORMATS[format] || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 104857600) return null;
  return { workspaceId, title: title.trim(), author: author.trim(), format, mimeType, byteSize };
}
export function validateProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isBookUuid(value.workspaceId) || !isBookUuid(value.sendId)
    || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 20) return null;
  const seen = new Set(); let seconds = 0;
  for (const event of value.events) {
    if (!event || typeof event !== 'object' || !isBookUuid(event.bookId) || !Number.isInteger(event.deltaSeconds) || event.deltaSeconds < 0 || event.deltaSeconds > 120
      || typeof event.position !== 'number' || !Number.isFinite(event.position) || event.position < 0 || event.position > 1
      || !Number.isSafeInteger(Date.parse(event.clientUpdatedAt)) || !(event.pagesRead === null || (Number.isInteger(event.pagesRead) && event.pagesRead >= 0))
      || Object.keys(event).sort().join(',') !== 'bookId,clientUpdatedAt,deltaSeconds,pagesRead,position') return null;
    if (seen.has(event.bookId)) return null;
    seen.add(event.bookId); seconds += event.deltaSeconds;
  }
  if (seconds > 120) return null;
  return { workspaceId: value.workspaceId, sendId: value.sendId, events: value.events };
}
export function booksEtag(payload, userId, workspaceId) {
  return `"${createHash('sha256').update(JSON.stringify([userId, workspaceId, payload])).digest('hex')}"`;
}
export function etagMatches(header, etag) { return (header ?? '').split(',').some(x => x.trim().replace(/^W\//, '') === etag); }
