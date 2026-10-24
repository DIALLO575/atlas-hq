import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE_ENDPOINT = "https://linear.app/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.linear.app/oauth/token";
const SCOPES = new Set(["read", "issues:create", "comments:create"]);

export class LinearOAuthError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearOAuthError";
    this.code = code;
  }
}

function validRedirectUri(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) &&
      !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function createLinearPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function linearAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, scopes = ["read"] }) {
  if (typeof clientId !== "string" || !clientId || !validRedirectUri(redirectUri) ||
      typeof state !== "string" || state.length < 32 ||
      typeof codeChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) ||
      !Array.isArray(scopes) || scopes.length === 0 ||
      scopes.some((scope) => !SCOPES.has(scope)) || !scopes.includes("read")) {
    throw new LinearOAuthError("LINEAR_OAUTH_INVALID_REQUEST");
  }
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(","),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    actor: "user",
  }).toString();
  return url;
}

/** Exchange is intended for a server route; callers must never return or log tokens. */
export async function exchangeLinearAuthorizationCode({
  code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl = fetch,
}) {
  if (typeof code !== "string" || !code || typeof clientId !== "string" || !clientId ||
      !validRedirectUri(redirectUri) || typeof codeVerifier !== "string" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier) ||
      (clientSecret !== undefined && (typeof clientSecret !== "string" || !clientSecret))) {
    throw new LinearOAuthError("LINEAR_OAUTH_INVALID_REQUEST");
  }

  const form = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  if (clientSecret) form.set("client_secret", clientSecret);

  let response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new LinearOAuthError("LINEAR_OAUTH_UNAVAILABLE");
  }
  if (!response.ok) throw new LinearOAuthError("LINEAR_OAUTH_REJECTED");

  let token;
  try {
    token = await response.json();
  } catch {
    throw new LinearOAuthError("LINEAR_OAUTH_INVALID_RESPONSE");
  }
  if (!token || token.token_type?.toLowerCase() !== "bearer" ||
      typeof token.access_token !== "string" || !token.access_token ||
      typeof token.refresh_token !== "string" || !token.refresh_token ||
      !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0) {
    throw new LinearOAuthError("LINEAR_OAUTH_INVALID_RESPONSE");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresInSeconds: token.expires_in,
    scopes: Array.isArray(token.scope) ? token.scope : String(token.scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}


/** Best-effort revoke for token pairs that could not be safely stored. */
export async function revokeLinearOAuthTokens({ accessToken, refreshToken, fetchImpl = fetch }) {
  for (const token of [accessToken, refreshToken]) {
    if (typeof token !== "string" || !token) continue;
    try {
      await fetchImpl("https://api.linear.app/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ token }),
        cache: "no-store",
      });
    } catch { /* Never expose provider responses or credentials to callers. */ }
  }
}
