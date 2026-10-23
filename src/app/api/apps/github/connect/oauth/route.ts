import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGitHubAppCode, verifyPersonalInstallation,
} from "../../../../../../../packages/connectors/github/src/user-installation-verification.mjs";
import {
  adminGitHubClient, connectorRedirect, consumeConnectAttempt, githubConnectCookieName,
  githubConnectSettings, persistVerifiedPersonalInstallation, readConnectState,
  requireWorkspaceAdmin,
} from "@/lib/github/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(settings: NonNullable<ReturnType<typeof githubConnectSettings>>, outcome: string) {
  const response = NextResponse.redirect(connectorRedirect(settings, outcome), 303);
  response.cookies.delete(githubConnectCookieName);
  return response;
}

/** GitHub user OAuth callback: prove owner before persisting ANY installation grant. */
export async function GET(request: NextRequest) {
  const settings = githubConnectSettings();
  if (!settings) return NextResponse.json({ error: "GITHUB_NOT_CONFIGURED" }, { status: 503 });
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(githubConnectCookieName)?.value;
  if (!state || !cookieState || state !== cookieState) return finish(settings, "invalid-state");

  const proof = readConnectState(state, settings.stateKey);
  if (!proof) return finish(settings, "invalid-state");
  const actor = await requireWorkspaceAdmin(proof.tenantId);
  if (!actor) return finish(settings, "forbidden");

  const admin = adminGitHubClient(settings);
  const consumed = await consumeConnectAttempt(admin, {
    workspaceId: actor.workspaceId, userId: actor.userId,
    state, stateKey: settings.stateKey, stage: "oauth",
  });
  if (!consumed || !consumed.installationId) return finish(settings, "invalid-state");

  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) return finish(settings, "oauth-denied");

  try {
    const redirectUri = `${settings.publicOrigin}/api/apps/github/connect/oauth`;
    const userToken = await exchangeGitHubAppCode({
      code, clientId: settings.clientId, clientSecret: settings.clientSecret,
      redirectUri,
    });
    const verified = await verifyPersonalInstallation({
      userToken, appId: settings.appId, installationId: consumed.installationId,
    });
    await persistVerifiedPersonalInstallation(admin, {
      workspaceId: actor.workspaceId,
      installationId: verified.installationId,
      repositoryIds: verified.repositoryIds,
    });
    // Do not store the temporary GitHub user token. The REST client subsequently
    // mints a separate, repository-restricted GitHub App installation token.
    return finish(settings, "connected");
  } catch {
    // No provider errors or tokens are reflected to the browser.
    return finish(settings, "verification-failed");
  }
}
