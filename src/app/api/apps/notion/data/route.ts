import { NextRequest, NextResponse } from "next/server";
import { NotionReadError, createNotionReadClient } from "../../../../../../packages/connectors/notion/src/rest-client.mjs";
import { projectNotionDatabaseSources, projectNotionDataSourceSchema,
  projectNotionDataSourceRows } from "../../../../../../packages/connectors/notion/src/data-source-projection.mjs";
import { NotionRefreshError } from "../../../../../../packages/connectors/notion/src/refresh-token.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError,
  refreshNotionPersonalConnection } from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function reply(body: object, status = 200, retryAfterSeconds: number | null = null) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    ...(retryAfterSeconds !== null ? { "Retry-After": String(retryAfterSeconds) } : {}),
  } });
}
/**
 * Source metadata and entries are ONLY available through an ATLAS personal
 * actor/workspace-scoped connection, with the same guarded OAuth token vault
 * and CAS refresh path as all other Notion routes.
 * No raw JSON, signed file links, filters, sorts, or arbitrary paths.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId") ?? "";
  const connectionId = params.get("connectionId") ?? "";
  const mode = params.get("mode") ?? "";
  const resourceId = params.get("resourceId") ?? "";
  const cursor = params.get("cursor");
  if (!["discover", "schema", "rows"].includes(mode) || !UUID.test(resourceId) ||
      (mode !== "rows" && cursor !== null) ||
      (cursor !== null && (cursor.length === 0 || cursor.length > 2048 ||
        /[\u0000-\u001f\u007f]/.test(cursor))) ||
      params.has("url") || params.has("filter") || params.has("sorts")) {
    return reply({ error: "notion-invalid-request" }, 400);
  }
  try {
    const loaded = await loadNotionPersonalConnection({ workspaceId, connectionId });
    const execute = async (client: typeof loaded.client) => {
      if (mode === "discover") {
        return projectNotionDatabaseSources(await client.getDatabase(resourceId),resourceId);
      }
      const source = await client.getDataSource(resourceId);
      const schema = projectNotionDataSourceSchema(source,resourceId);
      if (mode === "schema") return schema;
      const raw = await client.queryDataSource(resourceId,{
        size: 12, startCursor: cursor,
      });
      return projectNotionDataSourceRows(raw,resourceId,schema,{maxRows:12});
    };
    try {
      return reply(await execute(loaded.client));
    } catch(error) {
      if(!(error instanceof NotionReadError) || error.code!=="AUTH_REQUIRED")throw error;
      const fresh=await refreshNotionPersonalConnection(loaded);
      return reply(await execute(createNotionReadClient({
        token:fresh.accessToken,
        requestBudget:loaded.budgetForVersion(fresh.version),
      })));
    }
  } catch(error) {
    if(error instanceof NotionRefreshError) {
      return reply({error:"notion-reconnection-required"},
        error.code==="REFRESH_UNAVAILABLE"?503:409);
    }
    if(error instanceof NotionConnectionAccessError) {
      const status=error.code==="INVALID_REQUEST"?400 :
        error.code==="FORBIDDEN"?403 :
        ["NOT_CONFIGURED","STORE_UNAVAILABLE"].includes(error.code)?503 :
        error.code==="REFRESH_IN_PROGRESS"?409:404;
      return reply({error:"notion-connection-unavailable"},status);
    }
    if(error instanceof NotionReadError) {
      const status=error.code==="INVALID_INPUT"?400 :
        error.code==="PERMISSION_DENIED"?403 :
        error.code==="NOT_FOUND_OR_HIDDEN"?404 :
        error.code==="RATE_LIMITED"?429 :
        error.code==="AUTH_REQUIRED"?409:503;
      return reply({error:status===403||status===404?
        "notion-resource-unavailable":"notion-source-unavailable"},status,
      error.retryAfterSeconds);
    }
    return reply({error:"notion-source-unavailable"},503);
  }
}
