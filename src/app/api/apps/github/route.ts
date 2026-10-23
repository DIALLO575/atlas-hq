import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAuthorizedGitHubReader } from "../../../../../packages/connectors/github/src/authorized-reader.mjs";
import { GitHubReadError } from "../../../../../packages/connectors/github/src/github-app-client.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_VIEWS = new Set(["connections", "repositories", "pulls", "pull"]);

function positiveId(input: string | null): number | null {
  if (!input || !/^[1-9][0-9]*$/.test(input)) return null;
  const id = Number(input);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

function success(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

function providerFailure(error: unknown) {
  if (!(error instanceof GitHubReadError)) return fail("GITHUB_UNAVAILABLE", 503);
  const status = error.code === "PERMISSION_DENIED" ? 403
    : error.code === "NOT_FOUND_OR_HIDDEN" ? 404
    : error.code === "INVALID_INPUT" ? 400
    : error.code === "NOT_CONFIGURED" ? 503
    : error.code === "RATE_LIMITED" ? 503
    : error.code === "INVALID_RESPONSE" ? 502
    : 503;
  // Never forward raw exceptions, GitHub payloads, authorization headers or tokens.
  return fail(error.code, status);
}

/** Authenticated, READ-ONLY API. It never performs connection setup or writes. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId");
  const view = searchParams.get("view");
  if (!workspaceId || !UUID.test(workspaceId) || !view || !VALID_VIEWS.has(view)) {
    return fail("INVALID_REQUEST", 400);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("AUTH_UNAVAILABLE", 503);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail("AUTH_REQUIRED", 401);

  // Membership is checked before querying installation metadata or GitHub.
  // workspaceId is a requested resource, never proof of access.
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members").select("role")
    .eq("user_id", user.id).eq("workspace_id", workspaceId).maybeSingle();
  if (membershipError) return fail("WORKSPACE_UNAVAILABLE", 503);
  if (!membership || !["owner", "admin", "member"].includes(membership.role)) {
    return fail("WORKSPACE_FORBIDDEN", 403);
  }

  if (view === "connections") {
    const { data, error } = await supabase
      .from("atlas_github_installations")
      .select("installation_id, status, repository_selection, ownership_verified_at, repositories_verified_at")
      .eq("workspace_id", workspaceId).order("installation_id");
    if (error) return fail("CONNECTIONS_UNAVAILABLE", 503);
    return success({ installations: (data ?? []).map((entry) => ({
      installationId: entry.installation_id,
      status: entry.status,
      repositorySelection: entry.repository_selection,
      ownershipVerifiedAt: entry.ownership_verified_at,
      repositoriesVerifiedAt: entry.repositories_verified_at,
      // Database verification is NOT proof that GitHub is reachable right now.
      isLive: false,
    })) });
  }

  const installationId = positiveId(searchParams.get("installationId"));
  if (!installationId) return fail("INVALID_REQUEST", 400);

  const { data: installation, error: installationError } = await supabase
    .from("atlas_github_installations")
    .select("installation_id, workspace_id, status, repository_selection, ownership_verified_at, repositories_verified_at")
    .eq("installation_id", installationId).eq("workspace_id", workspaceId).maybeSingle();
  if (installationError) return fail("CONNECTIONS_UNAVAILABLE", 503);
  if (!installation || installation.status !== "repositories-ready" ||
      installation.repository_selection !== "selected" ||
      !installation.ownership_verified_at || !installation.repositories_verified_at) {
    return fail("GITHUB_NOT_AUTHORIZED", 403);
  }

  const { data: repositories, error: repositoryError } = await supabase
    .from("atlas_github_authorized_repositories")
    .select("repository_id").eq("installation_id", installationId)
    .order("repository_id").limit(501);
  if (repositoryError) return fail("CONNECTIONS_UNAVAILABLE", 503);
  // IDs originate ONLY from read-only, workspace-isolated database records.
  const repositoryIds = (repositories ?? []).map((row) => Number(row.repository_id));
  if (repositoryIds.length === 0 || repositoryIds.length > 500 ||
      repositoryIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(repositoryIds).size !== repositoryIds.length) {
    return fail("GITHUB_NOT_AUTHORIZED", 403);
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return fail("GITHUB_NOT_CONFIGURED", 503);

  try {
    const github = await createAuthorizedGitHubReader({
      tenantId: workspaceId,
      installationId,
      // The lookup adapter exposes only the tenant-verified record above.
      lookup: async ({ tenantId, installationId: requestedId }) => {
        if (tenantId !== workspaceId || requestedId !== installationId) return null;
        return {
          tenantId: workspaceId,
          installationId,
          status: installation.status,
          repositorySelection: installation.repository_selection,
          repositories: repositoryIds.map((id) => ({ id })),
        };
      },
      appId,
      privateKey,
    });

    if (view === "repositories") return success(await github.listRepositories());

    const repositoryId = positiveId(searchParams.get("repositoryId"));
    if (!repositoryId) return fail("INVALID_REQUEST", 400);
    if (view === "pulls") return success(await github.listPullRequests(repositoryId));

    const pullNumber = positiveId(searchParams.get("pullNumber"));
    if (!pullNumber) return fail("INVALID_REQUEST", 400);
    return success(await github.getPullRequest(repositoryId, pullNumber));
  } catch (error) {
    return providerFailure(error);
  }
}
