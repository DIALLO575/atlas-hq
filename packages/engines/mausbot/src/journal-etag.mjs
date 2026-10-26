import { createHash } from 'node:crypto';
export function journalEtag(payload, userId, workspaceId) {
  // Signed URLs rotate on every request. Their expiry is handled by client revalidation.
  const { coverExpiresAt: _expiry, ...stable } = payload;
  const value = { ...stable, items: payload.items.map(({ coverUrl: _url, ...item }) => item) };
  return '"' + createHash('sha256').update(JSON.stringify([userId,workspaceId,value])).digest('hex') + '"';
}
export function journalEtagMatches(header, etag) { return (header ?? '').split(',').some(tag => tag.trim().replace(/^W\//,'') === etag); }
