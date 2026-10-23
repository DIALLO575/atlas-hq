import { NextRequest, NextResponse } from "next/server";
import { parseGitHubAppSetupCallback } from "../../../../../../../packages/connectors/github/src/installation-flow.mjs";
import { githubUserOAuthUrl } from "../../../../../../../packages/connectors/github/src/user-installation-verification.mjs";
import {
  adminGitHubClient, connectorRedirect, consumeConnectAttempt, githubConnectCookieName,
  githubConnectSettings, readConnectState, registerConnectAttempt, requireWorkspaceAdmin,
} from "@/lib/github/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub App setup URL; `installation_id` is ALWAYS untrusted here. */
export async function GET(request: NextRequest) {
  const settings = githubConnectSettings();
  if (!settings) return NextResponse.json({ error: "GITHUB_NOT_CONFIGURED" }, { status: 503 });

  // GitHub setup redirects do not consistently echo state. A signed HttpOnly
  // same-browser cookie is the only permitted fallback, never installation_id.
  const cookieState = request.cookies.get(githubConnectCookieName)?.value;
  const returnedState = request.nextUrl.searchParams.get("state");
  if (!cookieState || (returnedState !== null && returnedState !== cookieState)) {
    return NextResponse.redirect(connectorRedirect(settings, "invalid-state"), 303);
  }
  const proof = readConnectState(cookieState, settings.stateKey);
  if (!proof) return NextResponse.redirect(connectorRedirect(settings, "invalid-state"), 303);
  const actor = await requireWorkspaceAdmin(proof.tenantId);
  if (!actor) return NextResponse.redirect(connectorRedirect(settings, "forbidden"), 303);

  const callbackQuery = new URLSearchParams(request.nextUrl.searchParams);
  callbackQuery.set("state", cookieState);
  const parsed = parseGitHubAppSetupCallback(callbackQuery, { key: settings.stateKey });
  if (!parsed.ok || parsed.setupAction === "request" || !parsed.installationId) {
    return NextResponse.redirect(connectorRedirect(settings, "installation-incomplete"), 303);
  }

  const admin = adminGitHubClient(settings);
  try {
    const consumed = await consumeConnectAttempt(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId, state: cookieState,
      stateKey: settings.stateKey, stage: "installation",
    });
    if (!consumed) return NextResponse.redirect(connectorRedirect(settings, "invalid-state"), 303);

    const oauthState = await registerConnectAttempt(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId, stateKey: settings.stateKey,
      stage: "oauth", installationId: parsed.installationId,
    });
    const redirectUri = `${settings.publicOrigin}/api/apps/github/connect/oauth`;
    const authorize = githubUserOAuthUrl({ clientId: settings.clientId, redirectUri, state: oauthState });
    const response = NextResponse.redirect(authorize, 303);
    response.cookies.set(githubConnectCookieName, oauthState, {
      httpOnly: true, sameSite: "lax", secure: settings.publicOrigin.startsWith("https:"),
      path: "/api/apps/github/connect", maxAge: 15 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(connectorRedirect(settings, "unavailable"), 303);
  }
}
