import { createLinearPkcePair, linearAuthorizationUrl } from "./oauth.mjs";
import { consumeLinearOAuthState, createLinearOAuthState, readLinearOAuthState } from "./oauth-state.mjs";

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
  settings, resolveActorForState, consumeState, now = Date.now(),
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
  // The handler has no exchange dependency by design: fail closed until token storage is reviewed.
  return redirect(settings, "callback-disabled", true);
}

export function registerOAuthStateWithStore(args) {
  return createLinearOAuthState({ ...args, key: args.stateKey });
}

export function consumeOAuthStateWithStore(args) {
  return consumeLinearOAuthState({ ...args, key: args.stateKey });
}
