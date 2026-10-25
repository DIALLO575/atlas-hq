import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSandboxRepositoryCreation } from "@/lib/github/studio-runner";
import { githubConnectSettings } from "@/lib/github/connect";
import { checkStudioApprovalReceipt } from "../../../../../../../../packages/connectors/github/src/github-studio-approval.mjs";
import { readStudioUserGrant, studioOAuthGrantCookie,
} from "../../../../../../../../packages/connectors/github/src/github-studio-user-oauth.mjs";
import {
  GitHubStudioError, parseRepositoryDraft, verifiedPersonalInstallation,
} from "../../../../../../../../packages/connectors/github/src/github-studio-create.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (payload: unknown, status: number) =>
  NextResponse.json(payload, {
    status, headers: { "Cache-Control": "no-store" },
  });

/**
 * Sandbox-only execution. OFF by default, and irreversibly blocked in
 * production even if a flag is set by accident. The shipped UI never invokes
 * this route. Never enable without GitHub App consent and sandbox migration.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.ATLAS_GITHUB_STUDIO_WRITE_ENABLED !== "sandbox") {
    return respond({ error: "STUDIO_DISABLED" }, 404);
  }
  const expectedWorkspace = process.env.ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID;
  const expectedInstallation = Number(process.env.ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID);
  if (!expectedWorkspace || !UUID.test(expectedWorkspace) ||
      !Number.isSafeInteger(expectedInstallation) || expectedInstallation < 1) {
    return respond({ error: "STUDIO_NOT_CONFIGURED" }, 503);
  }

  let expectedOrigin: string;
  try {
    const origin = new URL(process.env.ATLAS_PUBLIC_ORIGIN ?? "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" ||
        origin.search || origin.hash || origin.username || origin.password) {
      return respond({ error: "STUDIO_NOT_CONFIGURED" }, 503);
    }
    expectedOrigin = origin.origin;
  } catch { return respond({ error: "STUDIO_NOT_CONFIGURED" }, 503); }
  if (request.headers.get("origin") !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return respond({ error: "FORBIDDEN_ORIGIN" }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond({ error: "INVALID_INPUT" }, 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!UUID.test(idempotencyKey ?? "")) return respond({ error: "INVALID_INPUT" }, 400);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > 2048) {
    return respond({ error: "INVALID_INPUT" }, 400);
  }

  let draft;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return respond({ error: "INVALID_INPUT" }, 400);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        !("confirmed" in parsed) || parsed.confirmed !== true) {
      return respond({ error: "CONFIRMATION_REQUIRED" }, 400);
    }
    const { confirmed: _confirmed, ...spec } = parsed as Record<string, unknown>;
    void _confirmed;
    draft = parseRepositoryDraft(spec);
  } catch { return respond({ error: "INVALID_INPUT" }, 400); }

  if (draft.workspaceId !== expectedWorkspace ||
      draft.installationId !== expectedInstallation) {
    return respond({ error: "SANDBOX_ONLY" }, 403);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return respond({ error: "AUTH_UNAVAILABLE" }, 503);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return respond({ error: "AUTH_REQUIRED" }, 401);
  const { data: member, error: memberError } = await supabase.from("workspace_members")
    .select("role").eq("workspace_id", draft.workspaceId)
    .eq("user_id", user.id).maybeSingle();
  if (memberError) return respond({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  if (!member || !["owner", "admin"].includes(member.role)) {
    return respond({ error: "WORKSPACE_FORBIDDEN" }, 403);
  }
  const { data: row, error: installError } = await supabase.from("atlas_github_installations")
    .select("installation_id, workspace_id, status, repository_selection, ownership_verified_at, repositories_verified_at")
    .eq("workspace_id", draft.workspaceId)
    .eq("installation_id", draft.installationId).maybeSingle();
  if (installError) return respond({ error: "GITHUB_UNAVAILABLE" }, 503);
  const binding = row && {
    workspaceId: row.workspace_id,
    installationId: Number(row.installation_id),
    status: row.status,
    repositorySelection: row.repository_selection as "selected" | "all",
    ownershipVerifiedAt: row.ownership_verified_at,
    repositoriesVerifiedAt: row.repositories_verified_at,
  };
  if (!verifiedPersonalInstallation(binding, draft.workspaceId, draft.installationId)) {
    return respond({ error: "GITHUB_NOT_AUTHORIZED" }, 403);
  }
  // The browser cannot supply a GitHub user token; only our OAuth callback
  // issues this short-lived, authenticated+encrypted HttpOnly cookie.
  const settings = githubConnectSettings();
  // A signed, five-minute, tenant/actor/draft/idempotency-bound human approval
  // is MANDATORY in addition to the existing OAuth user grant and confirmation.
  // Do not infer approval solely from the GitHub App write permission.
  if (!settings || !checkStudioApprovalReceipt({
    receipt: request.headers.get("x-studio-approval") ?? undefined,
    draft, actorId: user.id, idempotencyKey: idempotencyKey!,
    secret: settings.stateKey,
  })) {
    return respond({ error: "STUDIO_APPROVAL_REQUIRED" }, 403);
  }
  const grant = readStudioUserGrant({
    cookie: request.cookies.get(studioOAuthGrantCookie)?.value,
    workspaceId: draft.workspaceId, actorId: user.id,
    installationId: draft.installationId, key: settings.stateKey,
  });
  if (!grant) return respond({ error: "STUDIO_USER_AUTH_REQUIRED" }, 403);
  try {
    const result = await executeSandboxRepositoryCreation({
      workspaceId: draft.workspaceId, actorId: user.id,
      installationId: draft.installationId, binding: binding!,
      draft, idempotencyKey: idempotencyKey!,
      userAccessToken: grant.accessToken,
    });
    return respond(result, result.state === "succeeded" ? 201 : 202);
  } catch (error) {
    const code = error instanceof GitHubStudioError ? error.code : "";
    // No raw Supabase or GitHub exception bodies are returned to browsers.
    const badInput = code === "INVALID_INPUT";
    return respond({ error: badInput ? "INVALID_INPUT" : "STUDIO_OPERATION_UNAVAILABLE" },
      badInput ? 400 : 503);
  }
}
