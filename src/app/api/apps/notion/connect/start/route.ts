import { NextRequest, NextResponse } from "next/server";
import { buildNotionAuthorizationUrl } from "../../../../../../../packages/connectors/notion/src/oauth.mjs";
import {
  adminNotionClient, createRegisteredNotionState, notionConnectSettings,
  notionTokenVault, NOTION_OAUTH_COOKIE, requireNotionWorkspaceActor,
} from "@/lib/notion/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(code: string, status: number) {
  return NextResponse.json({ error: code }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: NextRequest) {
  const settings = notionConnectSettings();
  // A Notion OAuth UI must never start before a working server-side vault,
  // a validated callback and an explicitly enabled sandbox configuration.
  if (!settings || !notionTokenVault() || !settings.callbackEnabled) {
    return error("notion-not-configured", 503);
  }
  if (request.headers.get("origin") !== settings.publicOrigin) {
    return error("notion-origin-forbidden", 403);
  }
  let workspaceId: string;
  try {
    const form = await request.formData();
    const value = form.get("workspaceId");
    workspaceId = typeof value === "string" ? value : "";
  } catch { return error("notion-invalid-request", 400); }
  const actor = await requireNotionWorkspaceActor(workspaceId);
  if (!actor) return error("notion-workspace-forbidden", 403);
  try {
    const admin = adminNotionClient(settings);
    const state = await createRegisteredNotionState(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId, key: settings.stateKey,
    });
    const location = buildNotionAuthorizationUrl({
      clientId: settings.clientId, publicOrigin: settings.publicOrigin,
      redirectUri: settings.redirectUri, state,
    });
    const response = NextResponse.redirect(location, 303);
    response.cookies.set(NOTION_OAUTH_COOKIE, state, {
      httpOnly: true, secure: settings.publicOrigin.startsWith("https:"),
      sameSite: "lax", path: "/api/apps/notion", maxAge: 900,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch { return error("notion-start-unavailable", 503); }
}
