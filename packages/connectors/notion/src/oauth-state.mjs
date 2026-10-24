import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_TTL_SECONDS = 15 * 60;

function context({ workspaceId, userId, key }) {
  return UUID.test(workspaceId ?? "") && UUID.test(userId ?? "") &&
    typeof key === "string" && Buffer.byteLength(key, "utf8") >= 32;
}
function digest(state) {
  return createHash("sha256").update(state).digest("hex");
}
function signature(payload, key) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}
function same(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      left.length > 512 || right.length > 512) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * OAuth state does not contain the user or workspace ID. The database binds
 * the hash to a verified actor and workspace; the HttpOnly cookie binds browser.
 */
export async function createNotionOAuthState({
  workspaceId, userId, key, store, now = Date.now(),
}) {
  if (!context({ workspaceId, userId, key }) ||
      !store || typeof store.insertPendingState !== "function" ||
      !Number.isFinite(now)) throw new Error("NOTION_OAUTH_STATE_UNAVAILABLE");
  const expiresAt = Math.floor(now / 1000) + STATE_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    version: 1, nonce: randomBytes(32).toString("base64url"), expiresAt,
  })).toString("base64url");
  const state = payload + "." + signature(payload, key);
  await store.insertPendingState({
    stateHash: digest(state), workspaceId, userId,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
  return state;
}

/** Verify the signed state and the independent short-lived browser cookie. */
export function readNotionOAuthState({ state, cookieState, key, now = Date.now() }) {
  if (typeof key !== "string" || Buffer.byteLength(key) < 32 ||
      !Number.isFinite(now) || !same(state, cookieState)) return null;
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!same(parts[1], signature(parts[0], key))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { return null; }
  if (!payload || payload.version !== 1 ||
      typeof payload.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(payload.nonce) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(now / 1000) ||
      payload.expiresAt > Math.floor(now / 1000) + STATE_TTL_SECONDS) return null;
  return { stateHash: digest(state) };
}

/** One conditional DB update is the replay barrier, even across workers. */
export async function consumeNotionOAuthState({
  workspaceId, userId, key, state, cookieState, store, now = Date.now(),
}) {
  if (!context({ workspaceId, userId, key }) ||
      !store || typeof store.consumePendingState !== "function") return null;
  const proof = readNotionOAuthState({ state, cookieState, key, now });
  if (!proof) return null;
  try {
    const consumed = await store.consumePendingState({
      ...proof, workspaceId, userId, now: new Date(now).toISOString(),
    });
    return consumed ? { workspaceId, userId } : null;
  } catch { return null; }
}
