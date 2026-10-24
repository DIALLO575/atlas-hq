import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 15 * 60;

function stateSignature(payload, key) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function stateHash(state) {
  return createHash("sha256").update(state).digest("hex");
}

function validContext({ workspaceId, userId, key }) {
  return typeof workspaceId === "string" && workspaceId.length > 0 &&
    typeof userId === "string" && userId.length > 0 &&
    typeof key === "string" && Buffer.byteLength(key) >= 32;
}

/** Persist a one-time pending state hash before redirecting the user to Linear. */
export async function createLinearOAuthState({ workspaceId, userId, key, store, now = Date.now() }) {
  if (!validContext({ workspaceId, userId, key }) || !store || typeof store.insertPendingState !== "function") {
    throw new Error("LINEAR_OAUTH_STATE_UNAVAILABLE");
  }
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    workspaceId,
    userId,
    nonce: randomBytes(32).toString("base64url"),
    expiresAt: Math.floor(now / 1000) + TTL_SECONDS,
  })).toString("base64url");
  const state = `${payload}.${stateSignature(payload, key)}`;
  const proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  await store.insertPendingState({
    stateHash: stateHash(state),
    workspaceId,
    userId,
    expiresAt: new Date(proof.expiresAt * 1000).toISOString(),
  });
  return state;
}

/** Verify cookie, signature, actor and workspace, then atomically consume the state hash. */
export async function consumeLinearOAuthState({ state, cookieState, workspaceId, userId, key, store, now = Date.now() }) {
  if (!validContext({ workspaceId, userId, key }) || typeof state !== "string" ||
      state !== cookieState || !store || typeof store.consumePendingState !== "function") return null;
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(stateSignature(parts[0], key));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let proof;
  try {
    proof = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!proof || proof.version !== 1 || proof.workspaceId !== workspaceId || proof.userId !== userId ||
      typeof proof.nonce !== "string" || !Number.isSafeInteger(proof.expiresAt) ||
      proof.expiresAt <= Math.floor(now / 1000)) return null;
  try {
    const consumed = await store.consumePendingState({
      stateHash: stateHash(state),
      workspaceId,
      userId,
      now: new Date(now).toISOString(),
    });
    return consumed ? { workspaceId, userId } : null;
  } catch {
    return null;
  }
}
