/** Dependency-free B1 trust boundary, shared with node:test. */
export const ENTITIES = Object.freeze(["FOUNDER","VELMO","WAHABI","NEW_PLATFORM","PERSO"]);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PAGE_KEY = /^[a-z][a-z0-9_-]{0,63}$/;
export const AGENT_KEY = /^[A-Za-z0-9_-]{1,120}$/;
export function validContext(context) {
  return context !== null && typeof context === "object" && !Array.isArray(context) &&
    typeof context.workspaceId === "string" && UUID.test(context.workspaceId) &&
    typeof context.pageKey === "string" && PAGE_KEY.test(context.pageKey) &&
    (context.objectType === "mission" || context.objectType === "page") &&
    (context.objectId === null || (typeof context.objectId === "string" && UUID.test(context.objectId))) &&
    (context.objectType !== "page" || context.objectId === null);
}
/** An unbound '*' default may never act as an entity authorization. */
export function assertEntityScope(storedEntity, requestedEntity, otherBindings = []) {
  return ENTITIES.includes(storedEntity) && storedEntity === requestedEntity &&
    Array.isArray(otherBindings) && otherBindings.every((entity) => entity === "*" || entity === storedEntity);
}
/** Identical replays return duplicate:true. A different request may NEVER reuse a send_id. */
export function replayReceipt(receipt, digest) {
  if (!receipt) return null;
  if (receipt.body_digest !== digest) return { conflict: true, code: "SEND_ID_PAYLOAD_MISMATCH" };
  return { duplicate: true, accepted: receipt.state === "accepted", threadId: receipt.thread_id };
}
export function publicMessage(message, secret = "") {
  if (!message || typeof message !== "object" || !/^[A-Za-z0-9_-]{1,120}$/.test(message.id ?? "")) return null;
  if (typeof message.text !== "string") return null;
  let body = message.text.slice(0, 4000)
    .replace(/\bBearer\s+\S+/gi,"[secret masqué]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,"[secret masqué]")
    .replace(/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,"[secret masqué]");
  if (typeof secret === "string" && secret.length >= 8) body = body.split(secret).join("[secret masqué]");
  return { id: message.id, role: typeof message.role === "string" ? message.role.slice(0,32) : "inconnu",
    at: typeof message.at === "string" ? message.at.slice(0,64) : null, text: body };
}
