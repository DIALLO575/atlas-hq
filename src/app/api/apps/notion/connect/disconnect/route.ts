import { NextRequest, NextResponse } from "next/server";
import { revokeNotionOAuthToken } from "../../../../../../../packages/connectors/notion/src/oauth.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError } from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: object, status: number) {
  return NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
/**
 * Local access is disabled transactionally BEFORE any attempt to revoke the
 * external Notion token. A provider outage is reported as "pending" and never
 * restores the local connection. No credential is returned to the browser.
 */
export async function POST(request: NextRequest) {
  const origin = process.env.ATLAS_PUBLIC_ORIGIN?.replace(/\/$/, "");
  if (!origin || request.headers.get("origin") !== origin) {
    return json({ error: "notion-origin-forbidden" }, 403);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return json({ error: "notion-invalid-request" }, 400);
  }
  let workspaceId: string;
  let connectionId: string;
  try {
    const form = await request.formData();
    workspaceId = String(form.get("workspaceId") ?? "");
    connectionId = String(form.get("connectionId") ?? "");
  } catch { return json({ error: "notion-invalid-request" }, 400); }
  try {
    const { actor, admin, record, tokens, settings } =
      await loadNotionPersonalConnection({ workspaceId, connectionId });
    const { data, error } = await admin.rpc("atlas_notion_revoke_connection", {
      p_connection_id: connectionId, p_workspace_id: actor.workspaceId,
      p_user_id: actor.userId, p_expected_version: record.version,
    });
    if (error) return json({ error: "notion-disconnect-unavailable" }, 503);
    if (data !== true) return json({ error: "notion-disconnect-conflict" }, 409);
    try {
      await revokeNotionOAuthToken({
        clientId: settings.clientId, clientSecret: settings.clientSecret,
        token: tokens.accessToken,
      });
      return json({ disconnected: true, providerRevocation: "confirmed" }, 200);
    } catch {
      return json({ disconnected: true, providerRevocation: "pending" }, 200);
    }
  } catch (error) {
    if (error instanceof NotionConnectionAccessError) {
      const status = error.code === "INVALID_REQUEST" ? 400
        : error.code === "NOT_CONFIGURED" || error.code === "STORE_UNAVAILABLE" ? 503
        : error.code === "FORBIDDEN" ? 403 : 404;
      return json({ error: "notion-" + error.code.toLowerCase().replaceAll("_", "-") }, status);
    }
    return json({ error: "notion-disconnect-unavailable" }, 503);
  }
}
