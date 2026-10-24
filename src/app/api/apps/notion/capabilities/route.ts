import { NextRequest, NextResponse } from "next/server";
import { evaluateNotionCapabilities, notionCapabilityEvidence }
  from "../../../../../../packages/connectors/notion/src/capability-policy.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError }
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
