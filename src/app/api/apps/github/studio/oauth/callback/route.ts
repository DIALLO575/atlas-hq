import { NextRequest, NextResponse } from "next/server";
import {
  adminGitHubClient, consumeConnectAttempt, githubConnectSettings,
  readConnectState, requireWorkspaceAdmin,
} from "@/lib/github/connect";
import {
  exchangeStudioOAuthCode, readStudioOAuthAttempt, sealStudioUserGrant,
  studioOAuthAttemptCookie, studioOAuthGrantCookie, verifyStudioOAuthAccount,
} from "../../../../../../../../packages/connectors/github/src/github-studio-user-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(origin: string, code: string, grant?: { value: string; maxAge: number }) {
  const url = new URL("/apps/github", origin);
  url.searchParams.set("studioAuth", code);
  const result = NextResponse.redirect(url, 303);
  result.cookies.set(studioOAuthAttemptCookie, "", {
    path: "/api/apps/github/studio/oauth", httpOnly: true,
    sameSite: "lax", secure: true, maxAge: 0,
  });
  if (grant) result.cookies.set(studioOAuthGrantCookie, grant.value, {
    path: "/api/apps/github/studio/repositories/execute",
    httpOnly: true, sameSite: "strict", secure: true,
    maxAge: grant.maxAge,
  });
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.ATLAS_GITHUB_STUDIO_OAUTH_ENABLED !== "sandbox") {
    return NextResponse.json({ error: "STUDIO_OAUTH_DISABLED" }, { status: 404 });
  }
  const settings = githubConnectSettings();
  if (!settings || !settings.publicOrigin.startsWith("https://")) {
    return NextResponse.json({ error: "STUDIO_NOT_CONFIGURED" }, { status: 503 });
  }
  const state = request.nextUrl.searchParams.get("state");
  const proof = state && readConnectState(state, settings.stateKey);
  const attempt = state && readStudioOAuthAttempt({
    cookie: request.cookies.get(studioOAuthAttemptCookie)?.value,
    state, key: settings.stateKey,
  });
  if (!proof || !attempt || proof.tenantId !== attempt.workspaceId ||
      attempt.workspaceId !== process.env.ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID ||
      attempt.installationId !== Number(process.env.ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID)) {
    return finish(settings.publicOrigin, "invalid-state");
  }
  const actor = await requireWorkspaceAdmin(attempt.workspaceId);
  if (!actor || actor.userId !== attempt.actorId) return finish(settings.publicOrigin, "forbidden");

  const admin = adminGitHubClient(settings);
  const consumed = await consumeConnectAttempt(admin, {
    workspaceId: actor.workspaceId, userId: actor.userId,
    state, stateKey: settings.stateKey, stage: "oauth",
  });
  if (!consumed || consumed.installationId !== attempt.installationId) {
    return finish(settings.publicOrigin, "invalid-state");
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) {
    return finish(settings.publicOrigin, "denied");
  }

  const { data: installation, error } = await admin.from("atlas_github_installations")
    .select("installation_id").eq("installation_id", attempt.installationId)
    .eq("workspace_id", actor.workspaceId).eq("status", "repositories-ready").maybeSingle();
  if (error || !installation) return finish(settings.publicOrigin, "forbidden");

  try {
    const redirectUri = settings.publicOrigin + "/api/apps/github/studio/oauth/callback";
    const token = await exchangeStudioOAuthCode({
      code, verifier: attempt.verifier,
      clientId: settings.clientId, clientSecret: settings.clientSecret, redirectUri,
    });
    const account = await verifyStudioOAuthAccount({
      accessToken: token.accessToken, installationId: attempt.installationId,
    });
    const cookie = sealStudioUserGrant({
      accessToken: token.accessToken, githubUserId: account.userId,
      githubLogin: account.login, workspaceId: actor.workspaceId,
      actorId: actor.userId, installationId: attempt.installationId,
      key: settings.stateKey, lifetimeSeconds: token.lifetimeSeconds,
    });
    return finish(settings.publicOrigin, "authorized", {
      value: cookie, maxAge: Math.min(600, Math.floor(token.lifetimeSeconds)),
    });
  } catch {
    // Never log user token, provider error body, verifier or exchanged code.
    return finish(settings.publicOrigin, "unavailable");
  }
}
