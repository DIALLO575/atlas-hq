import { NextRequest, NextResponse } from "next/server";
import {
  adminGitHubClient, githubConnectSettings, registerConnectAttempt,
  requireWorkspaceAdmin,
} from "@/lib/github/connect";
import { studioMutationMode, studioSandboxBindingAllowed } from "@/lib/github/studio-availability";
import {
  createStudioOAuthAttempt, githubStudioAuthorizeUrl, studioOAuthAttemptCookie,
} from "../../../../../../../../packages/connectors/github/src/github-studio-user-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = (code: string, status: number) => NextResponse.json({ error: code },
  { status, headers: { "Cache-Control": "no-store" } });

/** Starts a separate, sandbox-only user-to-server grant for repository writes. */
export async function POST(request: NextRequest) {
  const mode = studioMutationMode();
  if (!mode) return forbidden("STUDIO_OAUTH_DISABLED", 404);
  const settings = githubConnectSettings();
  if (!settings || request.headers.get("origin") !== settings.publicOrigin ||
      !settings.publicOrigin.startsWith("https://")) {
    return forbidden("STUDIO_NOT_CONFIGURED", 503);
  }
  if (mode === "sandbox" &&
      (!process.env.ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID ||
       !process.env.ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID)) {
    return forbidden("STUDIO_NOT_CONFIGURED", 503);
  }
  let workspaceId = "";
  let requestedInstallation = 0;
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048) {
      return forbidden("INVALID_INPUT", 400);
    }
    const form = await request.formData();
    workspaceId = String(form.get("workspaceId") ?? "");
    requestedInstallation = Number(form.get("installationId") ?? "");
  } catch { return forbidden("INVALID_INPUT", 400); }
  if (!studioSandboxBindingAllowed(mode, workspaceId, requestedInstallation)) {
    return forbidden("SANDBOX_ONLY", 403);
  }
  const actor = await requireWorkspaceAdmin(workspaceId);
  if (!actor) return forbidden("WORKSPACE_FORBIDDEN", 403);

  const admin = adminGitHubClient(settings);
  const { data: installation, error } = await admin.from("atlas_github_installations")
    .select("installation_id,repository_selection,ownership_verified_at,repositories_verified_at")
    .eq("installation_id", requestedInstallation)
    .eq("workspace_id", workspaceId).eq("status", "repositories-ready").maybeSingle();
  if (error || !installation || !installation.ownership_verified_at ||
      !installation.repositories_verified_at ||
      !["selected", "all"].includes(installation.repository_selection)) {
    return forbidden("GITHUB_NOT_AUTHORIZED", 403);
  }

  try {
    const state = await registerConnectAttempt(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId,
      stateKey: settings.stateKey, stage: "oauth", installationId: requestedInstallation,
    });
    const attempt = createStudioOAuthAttempt({
      workspaceId, actorId: actor.userId, installationId: requestedInstallation, state, key: settings.stateKey,
    });
    const redirect = githubStudioAuthorizeUrl({
      clientId: settings.clientId,
      redirectUri: settings.publicOrigin + "/api/apps/github/studio/oauth/callback",
      state, challenge: attempt.challenge,
    });
    const result = NextResponse.redirect(redirect, 303);
    result.cookies.set(studioOAuthAttemptCookie, attempt.cookie, {
      path: "/api/apps/github/studio/oauth", httpOnly: true, secure: true,
      sameSite: "lax", maxAge: 15 * 60,
    });
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return forbidden("STUDIO_OAUTH_UNAVAILABLE", 503);
  }
}
