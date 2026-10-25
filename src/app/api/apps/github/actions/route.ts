import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GitHubReadError } from "../../../../../../packages/connectors/github/src/github-app-client.mjs";
import { createGitHubActionsReader } from "../../../../../../packages/connectors/github/src/github-actions-client.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positive = (s:string|null) => {
  if (!s || !/^[1-9][0-9]*$/.test(s)) return null;
  const id=Number(s); return Number.isSafeInteger(id) && id>0 ? id : null;
};
const fail = (code:string,status:number) => NextResponse.json({error:code},
  {status,headers:{"Cache-Control":"no-store"}});
const ok = (data:unknown) => NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});

/** GitHub Actions READ-ONLY. The existing PR reader remains unchanged. */
export async function GET(request:NextRequest) {
  const params=request.nextUrl.searchParams;
  const workspaceId=params.get("workspaceId");
  const installationId=positive(params.get("installationId"));
  const repositoryId=positive(params.get("repositoryId"));
  const view=params.get("view")??"runs";
  if (!workspaceId || !UUID.test(workspaceId) || !installationId || !repositoryId ||
      !["runs","jobs"].includes(view)) return fail("INVALID_REQUEST",400);
  const runId=view==="jobs"?positive(params.get("runId")):null;
  if (view==="jobs" && !runId) return fail("INVALID_REQUEST",400);
  const supabase=await createSupabaseServerClient();
  if (!supabase) return fail("AUTH_UNAVAILABLE",503);
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if (authError || !user) return fail("AUTH_REQUIRED",401);

  const {data:member,error:memberError}=await supabase.from("workspace_members")
    .select("role").eq("workspace_id",workspaceId).eq("user_id",user.id).maybeSingle();
  if (memberError) return fail("WORKSPACE_UNAVAILABLE",503);
  if (!member || !["owner","admin","member"].includes(member.role)) {
    return fail("WORKSPACE_FORBIDDEN",403);
  }
  const {data:installation,error:installationError}=await supabase.from("atlas_github_installations")
    .select("installation_id,workspace_id,status,repository_selection,ownership_verified_at,repositories_verified_at")
    .eq("workspace_id",workspaceId).eq("installation_id",installationId).maybeSingle();
  if (installationError) return fail("CONNECTIONS_UNAVAILABLE",503);
  if (!installation || installation.status!=="repositories-ready" ||
      !["selected","all"].includes(installation.repository_selection) ||
      !installation.ownership_verified_at || !installation.repositories_verified_at) {
    return fail("GITHUB_NOT_AUTHORIZED",403);
  }
  if (installation.repository_selection==="selected") {
    const {data:grant,error:grantError}=await supabase.from("atlas_github_authorized_repositories")
      .select("repository_id").eq("installation_id",installationId)
      .eq("repository_id",repositoryId).maybeSingle();
    if (grantError) return fail("CONNECTIONS_UNAVAILABLE",503);
    if (!grant || Number(grant.repository_id)!==repositoryId) return fail("GITHUB_NOT_AUTHORIZED",403);
  }
  // The "all" selection is checked by GitHub using a token narrowed to this ID.
  const appId=process.env.GITHUB_APP_ID;
  const privateKey=process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return fail("GITHUB_NOT_CONFIGURED",503);
  try {
    const client=await createGitHubActionsReader({installationId,repositoryId,appId,privateKey});
    return ok(view==="runs" ? await client.listRuns() : await client.listJobs(runId!));
  } catch(error) {
    // Never expose provider bodies, URLs, token values or credentials.
    const code=error instanceof GitHubReadError ? error.code : "GITHUB_UNAVAILABLE";
    const status=code==="PERMISSION_DENIED"?403
      :code==="NOT_FOUND_OR_HIDDEN"?404:code==="INVALID_INPUT"?400
      :code==="INVALID_RESPONSE"?502:503;
    return fail(code,status);
  }
}
