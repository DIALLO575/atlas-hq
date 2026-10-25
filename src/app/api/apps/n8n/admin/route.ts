import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { callN8nPublicAdminApi, resolveN8nReadOnlyConfig, N8nReadOnlyError }
  from "../../../../../../packages/engines/n8n/src/adapter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dedicated owner-operated n8n Public API console, completely separate from
 * the engine's durable autonomous outbox / SQL runtime. No guest, member,
 * agent, Chief tool, browser-held n8n key, arbitrary origin or remote host.
 */
function safeError(error: unknown) {
  if (error instanceof N8nReadOnlyError)
    return engineFailure(error.code, error.status);
  return engineFailure("N8N_ADMIN_UNAVAILABLE", 503);
}
function boundConfig(workspaceId: string | null) {
  // Configuration is intentionally an exact single Atlas workspace binding;
  // a caller cannot switch to another user's admin n8n account.
  if (!workspaceId) return null;
  return resolveN8nReadOnlyConfig(process.env, workspaceId);
}
async function authorize(workspaceId: string | null) {
  const access = await requireEngineWorkspace(workspaceId, true);
  if (!access.ok) return { ok: false as const, response: access.response };
  // An n8n instance-owner API key is stronger than ordinary workspace admin.
  if (access.role !== "owner")
    return { ok: false as const, response: engineFailure("N8N_OWNER_REQUIRED", 403) };
  return { ok: true as const };
}
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const workspaceId = p.get("workspaceId");
  const access = await authorize(workspaceId);
  if (!access.ok) return access.response;
  if (p.getAll("workspaceId").length !== 1 || p.getAll("path").length !== 1 ||
      p.getAll("query").length > 1 ||
      [...p.keys()].some(k => !["workspaceId", "path", "query"].includes(k))) {
    return engineFailure("N8N_ADMIN_QUERY_INVALID", 400);
  }
  try {
    const config = boundConfig(workspaceId);
    if (!config) return engineFailure("N8N_ADMIN_NOT_CONFIGURED", 503);
    const rawQuery = p.get("query");
    if (rawQuery && rawQuery.length > 2048) return engineFailure("N8N_ADMIN_QUERY_INVALID", 400);
    let query: unknown = {};
    try { query = rawQuery ? JSON.parse(rawQuery) : {}; }
    catch { return engineFailure("N8N_ADMIN_QUERY_INVALID", 400); }
    const data = await callN8nPublicAdminApi(config, {
      method: "GET", path: p.get("path"), query,
    });
    return engineSuccess({ source: "n8n-public-api", method: "GET", data });
  } catch (error) { return safeError(error); }
}
export async function POST(request: NextRequest) {
  // Reject cross-site form/fetch replay BEFORE reading the body or the key.
  if (request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return engineFailure("ORIGIN_FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return engineFailure("CONTENT_TYPE_INVALID", 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 280000))
    return engineFailure("REQUEST_TOO_LARGE", 413);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 280000) return engineFailure("REQUEST_TOO_LARGE", 413);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return engineFailure("N8N_ADMIN_REQUEST_INVALID", 400);
    input = value as Record<string, unknown>;
  } catch { return engineFailure("INVALID_JSON", 400); }
  if (Object.keys(input).some(k=>!["workspaceId","method","path","query","body","confirmation"].includes(k)))
    return engineFailure("N8N_ADMIN_REQUEST_INVALID", 400);
  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId : null;
  const access = await authorize(workspaceId);
  if (!access.ok) return access.response;
  if (typeof input.method !== "string" || input.method === "GET" ||
      !["POST","PUT","PATCH","DELETE"].includes(input.method))
    return engineFailure("N8N_ADMIN_METHOD_INVALID", 400);
  // Written acknowledgement matches the exact operation being performed.
  if (input.confirmation !== "CONFIRM " + input.method + " " + input.path)
    return engineFailure("N8N_ADMIN_CONFIRMATION_REQUIRED", 409);
  try {
    const config = boundConfig(workspaceId);
    if (!config) return engineFailure("N8N_ADMIN_NOT_CONFIGURED", 503);
    const data = await callN8nPublicAdminApi(config, {
      method: input.method, path: input.path, query: input.query, body: input.body,
    });
    return engineSuccess({ source: "n8n-public-api", method: input.method, data });
  } catch (error) { return safeError(error); }
}
