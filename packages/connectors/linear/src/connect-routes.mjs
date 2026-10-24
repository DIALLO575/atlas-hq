import { createLinearPkcePair, linearAuthorizationUrl } from "./oauth.mjs";
import { consumeLinearOAuthState, createLinearOAuthState, readLinearOAuthState } from "./oauth-state.mjs";
import { randomUUID } from "node:crypto";

export const LINEAR_STATE_COOKIE = "atlas_linear_oauth_state";
export const LINEAR_PKCE_COOKIE = "atlas_linear_pkce_verifier";
export const LINEAR_CALLBACK_PATH = "/api/apps/linear/connect/oauth";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/apps/linear/connect",
  maxAge: 15 * 60,
});

function trustedOrigin(settings) {
  try {
    const url = new URL(settings.publicOrigin);
    return url.protocol === "https:" && url.origin === settings.publicOrigin ? url.origin : null;
  } catch {
    return null;
  }
}

function error(status, code) {
  return { kind: "json", status, error: code, headers: { "Cache-Control": "private, no-store" }, cookies: [] };
}

function outcome(status, result, providerRevocation) {
  return { kind: "json", status, result, ...(providerRevocation ? { providerRevocation } : {}),
    headers: { "Cache-Control": "private, no-store" }, cookies: [] };
}

async function authorizeMutation(request, settings, authorizeWorkspaceAdmin) {
  if (!settings || !trustedOrigin(settings) || !settings.clientId ||
      typeof authorizeWorkspaceAdmin !== "function") return { response: error(503, "LINEAR_NOT_CONFIGURED") };
  if (request.headers.get("origin") !== settings.publicOrigin) return { response: error(403, "BAD_ORIGIN") };
  let workspaceId;
  try { workspaceId = String((await request.formData()).get("workspaceId") ?? ""); } catch {
    return { response: error(400, "INVALID_REQUEST") };
  }
  const actor = await authorizeWorkspaceAdmin(workspaceId);
  if (!actor || actor.workspaceId !== workspaceId || typeof actor.userId !== "string" || !UUID.test(actor.userId)) {
    return { response: error(403, "WORKSPACE_FORBIDDEN") };
  }
  return { actor };
}

function refreshState(connection, now) {
  if (connection.refreshAttemptId) {
    const started = Date.parse(connection.refreshStartedAt ?? "");
    return Number.isFinite(started) && started > now - 5 * 60_000 ? "refresh-in-progress" : "refresh-uncertain";
  }
  return null;
}

async function safeRevoke(revokeTokens, tokens) {
  if (!tokens) return { allRevoked: false };
  try { return await revokeTokens(tokens); } catch { return { allRevoked: false }; }
}

/** Durable claim precedes the provider request; uncertain outcomes leave the claim locked. */
export async function refreshLinearConnectionRoute(request, {
  settings, authorizeWorkspaceAdmin, loadConnection, claimRefresh,
  requestRefresh, completeRefresh, rejectRefresh, invalidateUncertainRefresh, revokeTokens, now = Date.now(),
}) {
  const authorized = await authorizeMutation(request, settings, authorizeWorkspaceAdmin);
  if (authorized.response) return authorized.response;
  if (typeof loadConnection !== "function" || typeof claimRefresh !== "function" ||
      typeof requestRefresh !== "function" || typeof completeRefresh !== "function" ||
      typeof rejectRefresh !== "function" || typeof invalidateUncertainRefresh !== "function" ||
      typeof revokeTokens !== "function") return error(503, "LINEAR_NOT_CONFIGURED");
  const { actor } = authorized;
  let connection;
  try { connection = await loadConnection(actor); } catch { return outcome(503, "unavailable"); }
  if (!connection || connection.revokedAt) return outcome(404, "not-connected");
  if (Date.parse(connection.accessExpiresAt) > now + 120_000) return outcome(200, "still-valid");
  const existing = refreshState(connection, now);
  if (existing) return outcome(409, existing);

  const attemptId = randomUUID();
  let claimed;
  try { claimed = await claimRefresh({ actor, version: connection.version, attemptId }); } catch {
    return outcome(503, "unavailable");
  }
  if (!claimed) {
    try { connection = await loadConnection(actor); } catch { return outcome(503, "unavailable"); }
    if (!connection || connection.revokedAt) return outcome(404, "not-connected");
    if (Date.parse(connection.accessExpiresAt) > now + 120_000) return outcome(200, "still-valid");
    return outcome(409, refreshState(connection, now) ?? "conflict");
  }

  const claim = { actor, version: connection.version, attemptId };
  let tokens;
  try {
    tokens = await requestRefresh(connection.refreshToken);
  } catch (cause) {
    if (cause?.code === "LINEAR_OAUTH_INVALID_GRANT") {
      let rejected = false;
      try { rejected = await rejectRefresh(claim); } catch { /* keep the local connection unusable on RPC failures */ }
      return outcome(rejected ? 401 : 503, rejected ? "reauth-required" : "unavailable");
    }
    // Do not clear the durable claim after a timeout, network failure, or malformed success:
    // the provider may already have consumed and rotated the old refresh token.
    return outcome(503, "refresh-uncertain");
  }

  if (!tokens || typeof tokens.accessToken !== "string" || !tokens.accessToken ||
      typeof tokens.refreshToken !== "string" || !tokens.refreshToken ||
      !Number.isSafeInteger(tokens.expiresInSeconds) || tokens.expiresInSeconds <= 0 ||
      !Array.isArray(tokens.scopes) || tokens.scopes.length !== 1 || tokens.scopes[0] !== "read") {
    const revocation = await safeRevoke(revokeTokens, tokens);
    try { await rejectRefresh(claim); } catch { /* remain fail-closed */ }
    return outcome(401, "reauth-required", revocation.allRevoked ? "confirmed" : "unconfirmed");
  }

  let completed;
  try {
    completed = await completeRefresh({
      ...claim,
      connection: { linearWorkspaceId: connection.linearWorkspaceId, linearActorId: connection.linearActorId },
      tokens,
      scopes: tokens.scopes,
      expiresAt: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
    });
  } catch { completed = false; }
  if (!completed) {
    // A disconnect or a storage failure may win the CAS after Linear rotates the token.
    try { await invalidateUncertainRefresh(claim); } catch { /* do not reactivate or retry the claimed token */ }
    const revocation = await safeRevoke(revokeTokens, tokens);
    return outcome(503, "refresh-uncertain", revocation.allRevoked ? "confirmed" : "unconfirmed");
  }
  return outcome(200, "refreshed");
}

/** Locally disables first; remote revocation is reported only when Linear returns HTTP 200. */
export async function disconnectLinearConnectionRoute(request, {
  settings, authorizeWorkspaceAdmin, loadConnection, revokeLocal, revokeTokens,
}) {
  const authorized = await authorizeMutation(request, settings, authorizeWorkspaceAdmin);
  if (authorized.response) return authorized.response;
  if (typeof loadConnection !== "function" || typeof revokeLocal !== "function" || typeof revokeTokens !== "function") {
    return error(503, "LINEAR_NOT_CONFIGURED");
  }
  const { actor } = authorized;
  let connection;
  try { connection = await loadConnection(actor); } catch { return outcome(503, "unavailable"); }
  if (!connection) return outcome(200, "disconnected", "unconfirmed");

  if (!connection.revokedAt) {
    let revoked;
    try { revoked = await revokeLocal({ actor, version: connection.version }); } catch { revoked = false; }
    if (!revoked) return outcome(409, "conflict");
  }

  let result;
  try { result = await revokeTokens({ accessToken: connection.accessToken, refreshToken: connection.refreshToken }); } catch { result = null; }
  return outcome(200, "disconnected", result?.allRevoked === true ? "confirmed" : "unconfirmed");
}

function redirect(settings, result, clear = false) {
  const origin = trustedOrigin(settings);
  if (!origin) return error(503, "LINEAR_NOT_CONFIGURED");
  const url = new URL("/apps", origin);
  url.searchParams.set("linear", result);
  return {
    kind: "redirect", status: 303, location: url.toString(),
    headers: { "Cache-Control": "private, no-store" },
    cookies: clear ? [LINEAR_STATE_COOKIE, LINEAR_PKCE_COOKIE].map((name) => ({
      name, value: "", ...COOKIE_OPTIONS, maxAge: 0,
    })) : [],
  };
}

function cookieValue(request, name) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

/** Session and membership verifier shared by the Next.js route and its behavior tests. */
export async function verifyLinearWorkspaceAdmin(client, workspaceId) {
  if (!UUID.test(workspaceId)) return null;
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return null;
  const { data: membership, error: membershipError } = await client.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) return null;
  return { workspaceId, userId: user.id };
}

/** Resolves only a pending row owned by the verified session user, then checks current admin membership. */
export async function verifyLinearStateActor({ client, admin, stateHash }) {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return null;
  const { data: pending, error: stateError } = await admin.from("atlas_linear_oauth_states")
    .select("workspace_id")
    .eq("state_hash", stateHash).eq("user_id", user.id).maybeSingle();
  if (stateError || !pending || !UUID.test(pending.workspace_id)) return null;
  const { data: membership, error: membershipError } = await client.from("workspace_members")
    .select("role").eq("workspace_id", pending.workspace_id).eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) return null;
  return { workspaceId: pending.workspace_id, userId: user.id };
}

export async function startLinearOAuthRoute(request, {
  settings, authorizeWorkspaceAdmin, registerState, now = Date.now(),
}) {
  if (!settings || !trustedOrigin(settings) || !settings.clientId ||
      settings.redirectUri !== `${settings.publicOrigin}${LINEAR_CALLBACK_PATH}` ||
      typeof settings.stateKey !== "string" || Buffer.byteLength(settings.stateKey) < 32) {
    return error(503, "LINEAR_NOT_CONFIGURED");
  }
  if (request.headers.get("origin") !== settings.publicOrigin) return error(403, "BAD_ORIGIN");
  let workspaceId;
  try { workspaceId = String((await request.formData()).get("workspaceId") ?? ""); } catch {
    return error(400, "INVALID_REQUEST");
  }
  const actor = await authorizeWorkspaceAdmin(workspaceId);
  if (!actor || actor.workspaceId !== workspaceId || typeof actor.userId !== "string" || !actor.userId) {
    return error(403, "WORKSPACE_FORBIDDEN");
  }
  try {
    const { verifier, challenge } = createLinearPkcePair();
    const state = await registerState({ ...actor, stateKey: settings.stateKey, now });
    const location = linearAuthorizationUrl({
      clientId: settings.clientId,
      redirectUri: settings.redirectUri,
      state,
      codeChallenge: challenge,
    }).toString();
    return {
      kind: "redirect", status: 303, location,
      headers: { "Cache-Control": "private, no-store" },
      cookies: [
        { name: LINEAR_STATE_COOKIE, value: state, ...COOKIE_OPTIONS },
        { name: LINEAR_PKCE_COOKIE, value: verifier, ...COOKIE_OPTIONS },
      ],
    };
  } catch {
    return error(503, "LINEAR_OAUTH_UNAVAILABLE");
  }
}

export async function callbackLinearOAuthRoute(request, {
  settings, resolveActorForState, consumeState, callbackEnabled = false, clientSecret,
  prepareConnectionStore, exchangeCode, verifyLinearIdentity, saveConnection, revokeTokens,
  now = Date.now(),
}) {
  if (!settings || !trustedOrigin(settings) || typeof settings.stateKey !== "string" ||
      Buffer.byteLength(settings.stateKey) < 32) return error(503, "LINEAR_NOT_CONFIGURED");
  const callback = new URL(request.url);
  const state = callback.searchParams.get("state") ?? "";
  const cookieState = cookieValue(request, LINEAR_STATE_COOKIE);
  const verifier = cookieValue(request, LINEAR_PKCE_COOKIE);
  const proof = readLinearOAuthState({ state, cookieState, key: settings.stateKey, now });
  if (!proof || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) return redirect(settings, "invalid-state", true);

  const actor = await resolveActorForState(proof.stateHash, new Date(now).toISOString());
  if (!actor || !UUID.test(actor.workspaceId) || typeof actor.userId !== "string" || !actor.userId) {
    return redirect(settings, "forbidden", true);
  }
  const consumed = await consumeState({ state, cookieState, ...actor, stateKey: settings.stateKey, now });
  if (!consumed) return redirect(settings, "invalid-state", true);
  if (callback.searchParams.has("error") || !callback.searchParams.get("code")) {
    return redirect(settings, "oauth-denied", true);
  }
  if (callbackEnabled !== true || typeof exchangeCode !== "function" ||
      typeof verifyLinearIdentity !== "function" || typeof saveConnection !== "function" ||
      typeof prepareConnectionStore !== "function" || typeof revokeTokens !== "function") {
    return redirect(settings, "callback-disabled", true);
  }
  try { await prepareConnectionStore(actor); } catch {
    return redirect(settings, "unavailable", true);
  }
  let tokens;
  try {
    tokens = await exchangeCode({
      code: callback.searchParams.get("code"),
      clientId: settings.clientId,
      clientSecret,
      redirectUri: settings.redirectUri,
      codeVerifier: verifier,
    });
    if (!tokens || tokens.scopes?.length !== 1 || tokens.scopes[0] !== "read") {
      if (tokens) await revokeTokens(tokens).catch(() => {});
      return redirect(settings, "unavailable", true);
    }
    const linearIdentity = await verifyLinearIdentity(tokens.accessToken);
    if (!linearIdentity || !UUID.test(linearIdentity.workspaceId) || !UUID.test(linearIdentity.userId)) {
      await revokeTokens(tokens).catch(() => {});
      return redirect(settings, "unavailable", true);
    }
    await saveConnection({
      actor,
      linearIdentity,
      tokens,
      scopes: tokens.scopes,
      expiresAt: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
    });
    return redirect(settings, "connected", true);
  } catch {
    // Best-effort revocation prevents an unpersisted token pair from becoming an orphaned grant.
    if (tokens) await revokeTokens(tokens).catch(() => {});
    // Provider and storage errors are mapped to a fixed outcome; no response bodies or secrets escape.
    return redirect(settings, "unavailable", true);
  }
}

export function registerOAuthStateWithStore(args) {
  return createLinearOAuthState({ ...args, key: args.stateKey });
}

export function consumeOAuthStateWithStore(args) {
  return consumeLinearOAuthState({ ...args, key: args.stateKey });
}
