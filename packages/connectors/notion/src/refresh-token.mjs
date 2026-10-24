/**
 * Notion REST OAuth refresh transport. Notion rotates access+refresh tokens.
 * This does NOT own concurrency; callers must first acquire the SQL claim.
 * Never log or expose token bodies to client responses.
 */
const ORIGIN = "https://api.notion.com/v1/oauth/token";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (x, max = 16384) => typeof x === "string" && x.length > 0 &&
  x.length <= max && !/[\r\n]/.test(x);
export class NotionRefreshError extends Error {
  constructor(code) {
    super(code);
    this.name = "NotionRefreshError";
    this.code = code;
  }
}
export async function refreshNotionOAuthToken({
  clientId, clientSecret, refreshToken,
  notionWorkspaceId, notionBotId,
  request = fetch, timeoutMs = 10000,
}) {
  if (![clientId, notionWorkspaceId, notionBotId].every(x => UUID.test(x ?? "")) ||
      !valid(clientSecret, 512) || !valid(refreshToken) ||
      typeof request !== "function" || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 || timeoutMs > 30000) {
    throw new NotionRefreshError("INVALID_CONFIGURATION");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await request(ORIGIN, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: {
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
      signal: controller.signal,
    });
  } catch {
    throw new NotionRefreshError("PROVIDER_RESULT_UNCERTAIN");
  } finally { clearTimeout(timeout); }
  if (!response || typeof response.status !== "number" || typeof response.ok !== "boolean") {
    throw new NotionRefreshError("PROVIDER_RESULT_UNCERTAIN");
  }
  if (!response.ok) {
    throw new NotionRefreshError([400, 401, 403].includes(response.status)
      ? "REAUTH_REQUIRED" : "PROVIDER_RESULT_UNCERTAIN");
  }
  let result;
  try { result = await response.json(); }
  catch { throw new NotionRefreshError("PROVIDER_RESULT_UNCERTAIN"); }
  if (!result || !valid(result.access_token) || !valid(result.refresh_token) ||
      !["bearer", "Bearer"].includes(result.token_type) ||
      result.workspace_id !== notionWorkspaceId || result.bot_id !== notionBotId) {
    throw new NotionRefreshError("PROVIDER_RESULT_UNCERTAIN");
  }
  return { accessToken: result.access_token, refreshToken: result.refresh_token };
}
