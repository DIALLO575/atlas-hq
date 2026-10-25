/**
 * In-memory message snapshots are bounded to protect mobile rendering and RAM.
 * No private conversation is persisted to localStorage, IndexedDB or shared caches.
 * OpenMausBot has a latest-page API but no native after-cursor endpoint.
 */
export const MAUSBOT_MESSAGE_WINDOW = 60;
export const MAUSBOT_MESSAGE_CACHE_LIMIT = 160;
export const MAUSBOT_THREAD_CACHE_LIMIT = 8;
export const MAUSBOT_THREAD_CACHE_TTL_MS = 20 * 60 * 1000;

function messageIdentity(message) {
  return typeof message?.id === "string" && message.id.length ? "id:" + message.id
    : ["fallback", message?.at ?? "", message?.role ?? "", message?.kind ?? "", message?.text ?? ""].join(":");
}

/** Only return changes after an authenticated client's last seen message.
 * Two overlapping tail messages allow the UI to refresh recently edited output.
 * If a cursor vanishes (branch switched or history exceeds the window), reset. */
export function mausbotMessageDelta(messages, afterId) {
  if (!Array.isArray(messages)) throw new Error("MAUSBOT_MESSAGES_INVALID");
  const recent = messages.slice(-MAUSBOT_MESSAGE_WINDOW);
  if (!afterId) return { reset: true, messages: recent };
  const anchor = recent.findLastIndex(message => message?.id === afterId);
  if (anchor < 0) return { reset: true, messages: recent };
  return { reset: false, messages: recent.slice(Math.max(0, anchor - 2)) };
}

/** Merge a bounded delta without re-rendering when no values changed. */
export function mergeMausbotMessages(current, incoming, reset = false) {
  if (!Array.isArray(incoming)) throw new Error("MAUSBOT_MESSAGES_INVALID");
  const base = reset ? [] : Array.isArray(current) ? current : [];
  const keys = new Map(base.map((message,index) => [messageIdentity(message),index]));
  let result = base;
  for (const message of incoming) {
    const key = messageIdentity(message);
    const existing = keys.get(key);
    if (existing === undefined) {
      if (result === base) result = [...base];
      keys.set(key,result.length);
      result.push(message);
    } else if (JSON.stringify(result[existing]) !== JSON.stringify(message)) {
      if (result === base) result = [...base];
      result[existing] = message;
    }
  }
  const truncated = result.length > MAUSBOT_MESSAGE_CACHE_LIMIT
    ? result.slice(-MAUSBOT_MESSAGE_CACHE_LIMIT) : result;
  if (reset && base.length === truncated.length &&
      base.every((message, i) => JSON.stringify(message) === JSON.stringify(truncated[i]))) return base;
  return truncated;
}

export function lastMausbotMessageId(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i=messages.length-1; i>=0; i--) {
    if (typeof messages[i]?.id === "string" && messages[i].id) return messages[i].id;
  }
  return null;
}

export function rememberMausbotThread(cache, key, messages, now = Date.now()) {
  // A caller only inserts data for the currently authorized in-memory workspace.
  for (const [k, entry] of cache) {
    if (now - entry.updatedAt >= MAUSBOT_THREAD_CACHE_TTL_MS) cache.delete(k);
  }
  cache.delete(key);
  cache.set(key,{messages,updatedAt:now});
  while (cache.size > MAUSBOT_THREAD_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return messages;
}
