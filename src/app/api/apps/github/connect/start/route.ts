import { NextRequest, NextResponse } from "next/server";
import { buildGitHubAppInstallUrl } from "../../../../../../../packages/connectors/github/src/installation-flow.mjs";
import {
  adminGitHubClient, githubConnectCookieName, githubConnectSettings,
  registerConnectAttempt, requireWorkspaceAdmin, connectorRedirect,
} from "@/lib/github/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const settings = githubConnectSettings();
  if (!settings) return NextResponse.json({ error: "GITHUB_NOT_CONFIGURED" }, { status: 503 });
  // Native HTML forms include an Origin on POST. Enforce it against the fixed,
  // operator-controlled canonical URL to prevent cross-site start requests.
  if (request.headers.get("origin") !== settings.publicOrigin) {
    return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 403 });
  }
  let workspaceId = "";
  try {
    const form = await request.formData();
    workspaceId = String(form.get("workspaceId") ?? "");
  } catch {
    return NextResponse.redirect(connectorRedirect(settings, "invalid-request"), 303);
  }
  const actor = await requireWorkspaceAdmin(workspaceId);
  if (!actor) return NextResponse.redirect(connectorRedirect(settings, "forbidden"), 303);
  try {
    const admin = adminGitHubClient(settings);
    const state = await registerConnectAttempt(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId,
      stateKey: settings.stateKey, stage: "installation",
    });
    const url = buildGitHubAppInstallUrl({ appSlug: settings.appSlug, state });
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(githubConnectCookieName, state, {
      httpOnly: true, sameSite: "lax", secure: settings.publicOrigin.startsWith("https:"),
      path: "/api/apps/github/connect", maxAge: 15 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(connectorRedirect(settings, "unavailable"), 303);
  }
}
