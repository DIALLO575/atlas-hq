import { NextRequest, NextResponse } from "next/server";
import { NotionReadError, createNotionReadClient } from "../../../../../../packages/connectors/notion/src/rest-client.mjs";
import { notionViewPreview, notionViewsList } from "../../../../../../packages/connectors/notion/src/resource-view.mjs";
import { projectNotionViewMetadata } from "../../../../../../packages/connectors/notion/src/view-metadata.mjs";
import { NotionRefreshError } from "../../../../../../packages/connectors/notion/src/refresh-token.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError, refreshNotionPersonalConnection } from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(body: object, status = 200, retryAfterSeconds: number | null = null) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
    ...(retryAfterSeconds !== null ? { "Retry-After": String(retryAfterSeconds) } : {}),
  } });
}
/**
 * Actor-bound, read-only Notion-native view discovery & preview.
 * A preview creates a short-lived provider query cache, not a database clone.
 * Deliberately no view configuration writes, scheduling, or bulk crawling.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId") ?? "";
  const connectionId = params.get("connectionId") ?? "";
  const mode = params.get("mode") ?? "list";
  const resourceId = params.get("resourceId") ?? "";
  const sourceKind = params.get("sourceKind") ?? "";
  const viewId = params.get("viewId") ?? "";
  const cursor = params.get("cursor");
  if (!["list", "preview"].includes(mode) ||
      (mode === "list" && (!UUID.test(resourceId) ||
        !["database", "data_source"].includes(sourceKind) ||
        (cursor !== null && (!cursor || cursor.length > 2048)))) ||
      (mode === "preview" && (!UUID.test(viewId) || !UUID.test(resourceId) ||
        !["database", "data_source"].includes(sourceKind) || cursor !== null))) {
    return reply({ error: "notion-invalid-request" }, 400);
  }
  try {
    const loaded = await loadNotionPersonalConnection({ workspaceId, connectionId });
    const execute = async (client: typeof loaded.client) => {
      if (mode === "preview") {
        // Bind the selected view to the selected database or data source.
        // Provider query filters/sorts are applied by Notion, not the client.
        const detail = await client.getView(viewId);
        let metadata;
        try {
          metadata = projectNotionViewMetadata(detail,{
            viewId,sourceKind:sourceKind as "database" | "data_source",resourceId,
          });
        } catch {
          throw new NotionReadError("NOT_FOUND_OR_HIDDEN",404);
        }
        const snapshot = await client.previewView(viewId,{size:12});
        let safe;
        let queryReleased = false;
        try {
          safe = notionViewPreview(snapshot);
        } finally {
          // Deletes only the short-lived provider query cache, never user
          // content or the native view. No retries for ambiguous DELETEs.
          try {queryReleased=await client.releaseViewQuery(viewId,snapshot.id);}
          catch {queryReleased=false;}
        }
        return {...safe,metadata,queryReleased};
      }
      const raw = await client.listViews({
        sourceKind: sourceKind as "database" | "data_source",
        resourceId, startCursor: cursor, size: 8,
      });
      // Notion list responses may contain only view references. Hydrate a
      // maximum of eight views, keeping the full provider payload server-side.
      const views = [];
      for (const ref of raw.results.slice(0, 8)) {
        if (!ref || ref.object !== "view" || typeof ref.id !== "string" ||
            !UUID.test(ref.id)) continue;
        let detail;
        try {detail=await client.getView(ref.id);}
        catch(error) {
          if(error instanceof NotionReadError &&
             ["PERMISSION_DENIED","NOT_FOUND_OR_HIDDEN"].includes(error.code))continue;
          throw error;
        }
        try {
          const metadata=projectNotionViewMetadata(detail,{
            viewId:ref.id,sourceKind:sourceKind as "database" | "data_source",resourceId,
          });
          views.push({detail,metadata});
        } catch {
          // Provider may return linked views for another source. Never
          // disclose their names, filters or resource identifiers.
          continue;
        }
      }
      const projected=notionViewsList({
        results:views.map(item=>item.detail),
        has_more:raw.has_more,next_cursor:raw.next_cursor,
      });
      const byId=new Map(views.map(item=>[item.detail.id,item.metadata]));
      return {...projected,results:projected.results.map(item=>({
        ...item,metadata:byId.get(item.id),
      }))};
    };
    try {
      return reply(await execute(loaded.client));
    } catch (error) {
      if (!(error instanceof NotionReadError) || error.code !== "AUTH_REQUIRED") throw error;
      const fresh = await refreshNotionPersonalConnection(loaded);
      return reply(await execute(createNotionReadClient({
        token: fresh.accessToken,
        requestBudget: loaded.budgetForVersion(fresh.version),
      })));
    }
  } catch (error) {
    if (error instanceof NotionRefreshError) {
      return reply({ error: "notion-reconnection-required" },
        error.code === "REFRESH_UNAVAILABLE" ? 503 : 409);
    }
    if (error instanceof NotionConnectionAccessError) {
      const status = error.code === "INVALID_REQUEST" ? 400
        : error.code === "FORBIDDEN" ? 403
        : ["NOT_CONFIGURED", "STORE_UNAVAILABLE"].includes(error.code) ? 503
        : error.code === "REFRESH_IN_PROGRESS" ? 409 : 404;
      return reply({ error: "notion-connection-unavailable" }, status);
    }
    if (error instanceof NotionReadError) {
      const status = error.code === "INVALID_INPUT" ? 400
        : error.code === "PERMISSION_DENIED" ? 403
        : error.code === "NOT_FOUND_OR_HIDDEN" ? 404
        : error.code === "RATE_LIMITED" ? 429
        : error.code === "AUTH_REQUIRED" ? 409 : 503;
      return reply({ error: status === 403 || status === 404
        ? "notion-resource-unavailable" : "notion-view-unavailable" },
        status, error.retryAfterSeconds);
    }
    return reply({ error: "notion-view-unavailable" }, 503);
  }
}
