/**
 * Notion public REST OAuth protocol primitives.
 * SECURITY: these functions DO NOT store state or credentials.
 * ATLAS routes must bind state to a session/workspace, consume it once,
 * and encrypt the tokens in a server-only vault (SHA-122).
 */
export const NOTION_OAUTH_CALLBACK_PATH = "/api/apps/notion/oauth/callback";
const ORIGIN = "https://api.notion.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotionOAuthError extends Error {
  constructor(code) {
    super(code);
    this.name = "NotionOAuthError";
    this.code = code;
  }
}
function nonempty(value, max = 2048) {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    !/[\r\n]/.test(value);
}
function callbackAllowed(redirectUri, publicOrigin) {
  try {
    const origin = new URL(publicOrigin);
    const callback = new URL(redirectUri);
    return origin.origin === publicOrigin.replace(/\/$/, "") &&
      (origin.protocol === "https:" || (origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname))) &&
      callback.toString() === redirectUri && !callback.search && !callback.hash &&
      !callback.username && !callback.password &&
      callback.toString() === origin.origin + NOTION_OAUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}
export function buildNotionAuthorizationUrl({ clientId, redirectUri, publicOrigin, state }) {
  if (!UUID.test(clientId ?? "") || !nonempty(state, 512) ||
      !callbackAllowed(redirectUri, publicOrigin)) {
    throw new NotionOAuthError("OAUTH_CONFIGURATION_INVALID");
  }
  const url = new URL("/v1/oauth/authorize", ORIGIN);
  url.searchParams.set("owner", "user");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}
export async function exchangeNotionAuthorizationCode({
  clientId, clientSecret, code, redirectUri, publicOrigin, request = fetch,
}) {
  if (!UUID.test(clientId ?? "") || !nonempty(clientSecret, 512) ||
      !nonempty(code, 2048) || !callbackAllowed(redirectUri, publicOrigin) ||
      typeof request !== "function") {
    throw new NotionOAuthError("OAUTH_CONFIGURATION_INVALID");
  }
  let response;
  try {
    response = await request(ORIGIN + "/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify({
        grant_type: "authorization_code", code, redirect_uri: redirectUri,
      }),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new NotionOAuthError("PROVIDER_UNAVAILABLE");
  }
  if (!response?.ok) {
    throw new NotionOAuthError(response?.status === 401 ? "OAUTH_REJECTED" : "PROVIDER_UNAVAILABLE");
  }
  let value;
  try { value = await response.json(); } catch {
    throw new NotionOAuthError("INVALID_RESPONSE");
  }
  if (!value || !nonempty(value.access_token, 16384) ||
      (value.refresh_token !== null && value.refresh_token !== undefined &&
       !nonempty(value.refresh_token, 16384)) ||
      !UUID.test(value.workspace_id ?? "") || !UUID.test(value.bot_id ?? "") ||
      (value.token_type !== "bearer" && value.token_type !== "Bearer")) {
    throw new NotionOAuthError("INVALID_RESPONSE");
  }
  // Server-only result. Never serialize this object to an HTTP response or log it.
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token ?? null,
    notionWorkspaceId: value.workspace_id,
    notionBotId: value.bot_id,
    workspaceName: typeof value.workspace_name === "string" ?
      value.workspace_name.slice(0, 160) : null,
  };
}
