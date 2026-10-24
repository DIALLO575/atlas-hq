import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  GitHubStudioError, parseRepositoryDraft, verifiedPersonalInstallation,
} from "../../../../../../../../packages/connectors/github/src/github-studio-create.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

/**
 * M0/M1 preparation: authenticated, server-checked, PREVIEW ONLY.
 * This route NEVER mints a write token or creates a repository.
 */
export async function POST(request: NextRequest) {
  // Production origin is a configured trust anchor, not a user-controlled Host.
  const configuredOrigin = process.env.ATLAS_PUBLIC_ORIGIN;
  if (!configuredOrigin) return fail("STUDIO_NOT_CONFIGURED", 503);
  let origin: string;
  try {
    const expected = new URL(configuredOrigin);
    if (expected.protocol !== "https:" && expected.hostname !== "localhost") {
      return fail("STUDIO_NOT_CONFIGURED", 503);
    }
    origin = expected.origin;
  } catch { return fail("STUDIO_NOT_CONFIGURED", 503); }
  if (request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return fail("FORBIDDEN_ORIGIN", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail("INVALID_REQUEST", 400);
  }
  if (Number(request.headers.get("content-length") ?? "0") > 2048) {
    return fail("INVALID_REQUEST", 400);
  }
  let draft;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return fail("INVALID_REQUEST", 400);
    draft = parseRepositoryDraft(JSON.parse(raw));
  } catch (error) {
    return fail(error instanceof GitHubStudioError ? error.code : "INVALID_REQUEST", 400);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("AUTH_UNAVAILABLE", 503);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return fail("AUTH_REQUIRED", 401);
  const { data: membership, error: memberError } = await supabase.from("workspace_members")
    .select("role").eq("workspace_id", draft.workspaceId)
    .eq("user_id", user.id).maybeSingle();
  if (memberError) return fail("WORKSPACE_UNAVAILABLE", 503);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return fail("WORKSPACE_FORBIDDEN", 403);
  }
  const { data: installation, error: installationError } = await supabase
    .from("atlas_github_installations")
    .select("installation_id, workspace_id, status, repository_selection, ownership_verified_at, repositories_verified_at")
    .eq("workspace_id", draft.workspaceId)
    .eq("installation_id", draft.installationId)
    .maybeSingle();
  if (installationError) return fail("CONNECTIONS_UNAVAILABLE", 503);
  if (!verifiedPersonalInstallation(installation && {
    workspaceId: installation.workspace_id,
    installationId: Number(installation.installation_id),
    status: installation.status,
    repositorySelection: installation.repository_selection,
    ownershipVerifiedAt: installation.ownership_verified_at,
    repositoriesVerifiedAt: installation.repositories_verified_at,
  }, draft.workspaceId, draft.installationId)) return fail("GITHUB_NOT_AUTHORIZED", 403);

  // No claim is made that creation permission has been granted by GitHub.
  return NextResponse.json({
    preview: {
      name: draft.name,
      description: draft.description,
      private: draft.private,
      autoInit: draft.autoInit,
    },
    canExecute: false,
    nextStep: "GITHUB_APP_PERMISSION_AND_WRITEBACK_APPROVAL_REQUIRED",
  }, { headers: { "Cache-Control": "no-store" } });
}
