import { NextRequest, NextResponse } from "next/server";
import { notionBlockView, notionListView } from "../../../../../../packages/connectors/notion/src/resource-view.mjs";
import { NotionReadError } from "../../../../../../packages/connectors/notion/src/rest-client.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError } from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: object, status = 200, retryAfterSeconds: number | null = null) {
  return NextResponse.json(body, {
    status, headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfterSeconds !== null ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
  });
}
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId") ?? "";
  const connectionId = params.get("connectionId") ?? "";
  const kind = params.get("kind") ?? "search";
  const query = params.get("query") ?? "";
  const resourceId = params.get("resourceId") ?? "";
  const cursor = params.get("cursor");
  if (!["search", "blocks"].includes(kind) || query.length > 200 ||
      (cursor !== null && (cursor.length === 0 || cursor.length > 2048))) {
    return json({ error: "notion-invalid-request" }, 400);
  }
  try {
    // Only reads the personal connection of the logged-in, still-authorized admin.
    const { client } = await loadNotionPersonalConnection({ workspaceId, connectionId });
    if (kind === "search") {
      const response = await client.searchByTitle({ query, startCursor: cursor, size: 30 });
      return json(notionListView(response));
    }
    const response = await client.listBlockChildren(resourceId, {
      startCursor: cursor, size: 40,
    });
    return json(notionBlockView(response));
  } catch (error) {
    if (error instanceof NotionConnectionAccessError) {
      const status = error.code === "INVALID_REQUEST" ? 400
        : error.code === "NOT_CONFIGURED" || error.code === "STORE_UNAVAILABLE" ? 503
        : error.code === "FORBIDDEN" ? 403 : 404;
      return json({ error: "notion-" + error.code.toLowerCase().replaceAll("_", "-") }, status);
    }
    if (error instanceof NotionReadError) {
      const status = error.code === "AUTH_REQUIRED" ? 409
        : error.code === "PERMISSION_DENIED" ? 403
        : error.code === "NOT_FOUND_OR_HIDDEN" ? 404
        : error.code === "RATE_LIMITED" ? 429 : 502;
      return json({ error: "notion-" + error.code.toLowerCase().replaceAll("_", "-") },
        status, error.retryAfterSeconds);
    }
    return json({ error: "notion-read-unavailable" }, 503);
  }
}
