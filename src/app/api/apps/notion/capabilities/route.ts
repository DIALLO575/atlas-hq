import { NextRequest, NextResponse } from "next/server";
import { evaluateNotionCapabilities, notionCapabilityEvidence }
  from "../../../../../../packages/connectors/notion/src/capability-policy.mjs";
import { notionResourceRef, notionResourceOperation }
  from "../../../../../../packages/connectors/notion/src/resource-reference.mjs";
import { createNotionReadClient, NotionReadError }
  from "../../../../../../packages/connectors/notion/src/rest-client.mjs";
import { NotionRefreshError } from "../../../../../../packages/connectors/notion/src/refresh-token.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError, refreshNotionPersonalConnection }
  from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(data: object, status = 200) {
  return NextResponse.json(data, {
    status, headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

/**
 * On-demand, actor-bound capability snapshot; optional live checks read ONLY.
 * No provider/grant/configuration assertions come from browser input.
 * A successful search proves search.title, NOT pages.read or other scopes.
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  const connectionId = request.nextUrl.searchParams.get("connectionId") ?? "";
  const verify = request.nextUrl.searchParams.get("verify") === "1";
  const requestedKind = request.nextUrl.searchParams.get("resourceKind");
  const requestedId = request.nextUrl.searchParams.get("resourceId");
  const wantsResource = requestedKind !== null || requestedId !== null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (wantsResource && (!verify || !requestedKind || !requestedId ||
      !["page", "block", "database", "data_source"].includes(requestedKind) ||
      !uuid.test(requestedId))) {
    return reply({ error: "invalid-resource-request" }, 400);
  }
  try {
    const loaded = await loadNotionPersonalConnection({ workspaceId, connectionId });
    const { actor, record, client } = loaded;
    const binding = {
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      connectionId: record.connection_id,
      notionWorkspaceId: record.notion_workspace_id,
      surface: "rest" as const,
      credential: "notion_rest_oauth" as const,
      active: true,
    };
    // The resource path is an explicit probe against Notion, not an inferred
    // grant from a search listing or a cached provider object.
    if (wantsResource && requestedKind && requestedId) {
      const kind = requestedKind as "page" | "block" | "database" | "data_source";
      const operation = notionResourceOperation(kind);
      const get = (client: typeof loaded.client) => kind === "page"
        ? client.getPage(requestedId) : kind === "block"
        ? client.getBlock(requestedId) : kind === "database"
        ? client.getDatabase(requestedId) : client.getDataSource(requestedId);
      let raw;
      try {
        raw = await get(client);
      } catch (error) {
        if (!(error instanceof NotionReadError) || error.code !== "AUTH_REQUIRED") throw error;
        const refreshed = await refreshNotionPersonalConnection(loaded);
        raw = await get(createNotionReadClient({ token: refreshed.accessToken }));
      }
      const checkedAt = Date.now();
      const resourceRef = notionResourceRef({
        kind, resourceId: requestedId, connectionBinding: binding,
        providerResponse: raw, checkedAt,
      });
      const proof = notionCapabilityEvidence({
        operation, connectionBinding: binding, resourceRef, checkedAt,
      });
      const snapshot = evaluateNotionCapabilities({
        configuredSurfaces: { rest: true }, connectionBinding: binding,
        resourceRef, providerEvidence: [proof], checkedAt,
      });
      return reply({
        ...snapshot, resource: resourceRef,
      });
    }
    const checkedAt = Date.now();
    const proof = [];
    const failed = [];
    if (verify) {
      let botIsValid = false;
      try {
        const bot = await client.getCurrentBot();
        if (bot.id === record.notion_bot_id) {
          botIsValid = true;
          proof.push(notionCapabilityEvidence({
            operation: "rest.users.me", connectionBinding: binding, checkedAt,
          }));
        } else {
          failed.push("rest.users.me");
        }
      } catch {
        failed.push("rest.users.me");
      }
      // Never verify content permissions if token describes another bot.
      if (botIsValid) {
        try {
          await client.searchByTitle({ query: "", size: 1 });
          proof.push(notionCapabilityEvidence({
            operation: "rest.search.title", connectionBinding: binding, checkedAt,
          }));
        } catch {
          failed.push("rest.search.title");
        }
      }
    }
    return reply(evaluateNotionCapabilities({
      configuredSurfaces: { rest: true },
      connectionBinding: binding, providerEvidence: proof,
      failedOperations: failed, checkedAt,
    }));
  } catch (error) {
    if (error instanceof NotionRefreshError) {
      return reply({ error: "notion-reconnection-required" }, 409);
    }
    if (error instanceof NotionReadError) {
      const status = error.code === "INVALID_INPUT" ? 400
        : error.code === "PERMISSION_DENIED" ? 403
        : error.code === "NOT_FOUND_OR_HIDDEN" ? 404
        : error.code === "RATE_LIMITED" ? 429 : 503;
      return reply({ error: status === 404 ? "notion-resource-unavailable"
        : status === 403 ? "notion-access-denied"
        : status === 429 ? "notion-rate-limited" : "notion-request-unavailable" }, status);
    }
    if (error instanceof NotionConnectionAccessError) {
      const status = error.code === "INVALID_REQUEST" ? 400
        : error.code === "FORBIDDEN" ? 403
        : error.code === "NOT_CONFIGURED" || error.code === "STORE_UNAVAILABLE" ? 503
        : error.code === "REFRESH_IN_PROGRESS" ? 409 : 404;
      return reply({ error: status === 403 ? "notion-forbidden"
        : status === 400 ? "invalid-request"
        : status === 409 ? "refresh-in-progress" : "notion-unavailable" }, status);
    }
    return reply({ error: "notion-unavailable" }, 503);
  }
}
