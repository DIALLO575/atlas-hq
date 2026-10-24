import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const studioOAuthAttemptCookie = "atlas_gh_studio_oauth";
export const studioOAuthGrantCookie = "atlas_gh_studio_grant";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ATTEMPT_AGE = 15 * 60 * 1000;
const MAX_GRANT_AGE = 10 * 60 * 1000;
const SCOPES = new Set(["attempt", "grant"]);
const safeId = (n) => Number.isSafeInteger(n) && n > 0;
const safeSecret = (key) => typeof key === "string" && key.length >= 32;
const issue = (code) => { throw new Error(code); };

function derivedKey(secret, purpose) {
  if (!safeSecret(secret) || !SCOPES.has(purpose)) issue("OAUTH_NOT_CONFIGURED");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"),
    Buffer.from("atlas-github-studio-v1"), Buffer.from(purpose), 32));
}

function seal(payload, secret, purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(secret, purpose), iv);
  cipher.setAAD(Buffer.from("atlas-gh-studio:"+purpose));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((b) => b.toString("base64url")).join(".");
}

function unseal(raw, secret, purpose) {
  if (typeof raw !== "string" || raw.length > 8192 || !/^[a-zA-Z0-9_.-]+$/.test(raw)) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, ciphertext, tag] = parts.map((s) => Buffer.from(s, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 6000) return null;
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(secret, purpose), iv);
    decipher.setAAD(Buffer.from("atlas-gh-studio:"+purpose));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch { return null; }
}

export function createStudioOAuthAttempt({ workspaceId, actorId, installationId, state, key, now = Date.now() }) {
  if (!UUID.test(workspaceId ?? "") || !UUID.test(actorId ?? "") || !safeId(installationId) ||
      typeof state !== "string" || state.length < 30 || state.length > 2048 ||
      !Number.isFinite(now)) issue("OAUTH_INVALID_INPUT");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const cookie = seal({ workspaceId, actorId, installationId, state, verifier,
    expiresAt: now + MAX_ATTEMPT_AGE }, key, "attempt");
  return { cookie, challenge };
}

export function readStudioOAuthAttempt({ cookie, state, key, now = Date.now() }) {
  const payload = unseal(cookie, key, "attempt");
  if (!payload || !UUID.test(payload.workspaceId ?? "") ||
      !UUID.test(payload.actorId ?? "") || !safeId(payload.installationId) ||
      typeof payload.state !== "string" || typeof state !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(payload.verifier ?? "") ||
      !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now ||
      payload.expiresAt > now + MAX_ATTEMPT_AGE) return null;
  const a = Buffer.from(payload.state);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { workspaceId: payload.workspaceId, actorId: payload.actorId,
    installationId: payload.installationId, verifier: payload.verifier };
}

export function githubStudioAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  if (typeof clientId !== "string" || !/^[A-Za-z0-9_.-]{3,128}$/.test(clientId) ||
      typeof state !== "string" || !state || state.length > 2048 ||
      typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) issue("OAUTH_INVALID_INPUT");
  const callback = new URL(redirectUri);
  if (callback.protocol !== "https:" ||
      callback.pathname !== "/api/apps/github/studio/oauth/callback" ||
      callback.search || callback.hash) issue("OAUTH_INVALID_INPUT");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback.toString());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "offline_access");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeStudioOAuthCode({
  code, verifier, clientId, clientSecret, redirectUri, request = fetch,
}) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{10,512}$/.test(code) ||
      typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(verifier) ||
      !clientId || !clientSecret || !redirectUri) issue("OAUTH_INVALID_INPUT");
  let response;
  try {
    response = await request("https://github.com/login/oauth/access_token", {
      method: "POST", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret,
        code, redirect_uri: redirectUri, code_verifier: verifier }),
    });
  } catch { issue("OAUTH_EXCHANGE_FAILED"); }
  if (!response?.ok) issue("OAUTH_EXCHANGE_FAILED");
  let data;
  try { data = await response.json(); } catch { issue("OAUTH_EXCHANGE_FAILED"); }
  if (data?.error || typeof data?.access_token !== "string" ||
      !data.access_token || data.token_type?.toLowerCase() !== "bearer" ||
      (data.expires_in !== undefined && (!Number.isFinite(data.expires_in) || data.expires_in <= 0))) {
    issue("OAUTH_EXCHANGE_FAILED");
  }
  return { accessToken: data.access_token,
    lifetimeSeconds: data.expires_in ?? 600 };
}

export async function verifyStudioOAuthAccount({ accessToken, installationId, request = fetch }) {
  if (!safeId(installationId) || typeof accessToken !== "string" || !accessToken) issue("OAUTH_INVALID_INPUT");
  const headers = { Accept: "application/vnd.github+json",
    Authorization: "Bearer " + accessToken, "X-GitHub-Api-Version": "2026-03-10" };
  async function get(path) {
    let response;
    try {
      response = await request("https://api.github.com" + path, {
        method: "GET", headers, cache: "no-store", redirect: "error",
      });
    } catch { issue("OAUTH_PROOF_FAILED"); }
    if (!response?.ok) issue("OAUTH_PROOF_FAILED");
    try { return await response.json(); } catch { issue("OAUTH_PROOF_FAILED"); }
  }
  const [user, installations] = await Promise.all([get("/user"), get("/user/installations?per_page=100")]);
  if (!safeId(user?.id) || user?.type !== "User" || typeof user.login !== "string" ||
      !Array.isArray(installations?.installations) || !Number.isSafeInteger(installations.total_count) ||
      installations.total_count > 100 || installations.installations.length !== installations.total_count) {
    issue("OAUTH_PROOF_FAILED");
  }
  const installation = installations.installations.find((v) => v?.id === installationId &&
    v.target_type === "User" && v.account?.id === user.id &&
    v.account?.login?.toLowerCase() === user.login.toLowerCase() && !v.suspended_at &&
    v.permissions?.repository_creation === "write");
  if (!installation) issue("OAUTH_PERMISSION_REQUIRED");
  return { userId: user.id, login: user.login };
}

export function sealStudioUserGrant({
  accessToken, githubUserId, githubLogin, workspaceId, actorId, installationId,
  key, lifetimeSeconds, now = Date.now(),
}) {
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 2000 ||
      !safeId(githubUserId) || !/^[a-z0-9_.-]{1,100}$/i.test(githubLogin ?? "") ||
      !UUID.test(workspaceId ?? "") || !UUID.test(actorId ?? "") ||
      !safeId(installationId) || !Number.isFinite(lifetimeSeconds) ||
      lifetimeSeconds <= 0) issue("OAUTH_INVALID_INPUT");
  // Provider token lifetime may be 8h; Atlas grants a maximum 10 minutes.
  return seal({ accessToken, githubUserId, githubLogin, workspaceId, actorId, installationId,
    expiresAt: now + Math.min(MAX_GRANT_AGE, lifetimeSeconds * 1000) }, key, "grant");
}

export function readStudioUserGrant({ cookie, workspaceId, actorId, installationId, key, now = Date.now() }) {
  const p = unseal(cookie, key, "grant");
  if (!p || p.workspaceId !== workspaceId || p.actorId !== actorId ||
      p.installationId !== installationId || !safeId(p.githubUserId) ||
      !/^[a-z0-9_.-]{1,100}$/i.test(p.githubLogin ?? "") ||
      typeof p.accessToken !== "string" || !p.accessToken ||
      !Number.isFinite(p.expiresAt) || p.expiresAt <= now ||
      p.expiresAt > now + MAX_GRANT_AGE) return null;
  return { accessToken: p.accessToken, githubUserId: p.githubUserId, githubLogin: p.githubLogin };
}
