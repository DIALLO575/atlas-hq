import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adminGitHubClient, githubConnectSettings } from "@/lib/github/connect";
import { GitHubReadError } from "../../../../../../../packages/connectors/github/src/github-app-client.mjs";
import { createGitHubActionsWriter, type GitHubActionsTarget } from "../../../../../../../packages/connectors/github/src/github-actions-writer.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const positive=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
const reply=(data:unknown,status:number)=>NextResponse.json(data,{
  status,headers:{"Cache-Control":"no-store"},
});
const rerunEnabled=()=>{
  const env=process.env.VERCEL_ENV;
  return (env==="production"&&process.env.ATLAS_GITHUB_ACTIONS_RERUN_ENABLED==="production")||
    (env==="preview"&&process.env.ATLAS_GITHUB_ACTIONS_RERUN_ENABLED==="sandbox");
};
/**
 * Explicit, single-job Actions WRITE. This endpoint is independent of the
 * read-only route. No automatic relaunch on page visit or network retry.
 */
export async function POST(request:NextRequest){
  if(!rerunEnabled())return reply({error:"RERUN_DISABLED"},404);
  let expectedOrigin:string;
  try {
    const parsed=new URL(process.env.ATLAS_PUBLIC_ORIGIN??"");
    if(parsed.protocol!=="https:"||parsed.pathname!=="/"||parsed.search||
      parsed.hash||parsed.username||parsed.password)return reply({error:"NOT_CONFIGURED"},503);
    expectedOrigin=parsed.origin;
  }catch{return reply({error:"NOT_CONFIGURED"},503);}
  if(request.headers.get("origin")!==expectedOrigin||
     request.headers.get("sec-fetch-site")==="cross-site")return reply({error:"FORBIDDEN_ORIGIN"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return reply({error:"INVALID_REQUEST"},400);
  const length=Number(request.headers.get("content-length")??"0");
  if(!Number.isFinite(length)||length>1024)return reply({error:"INVALID_REQUEST"},400);
  let body:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(raw.length>1024)return reply({error:"INVALID_REQUEST"},400);
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return reply({error:"INVALID_REQUEST"},400);
    body=parsed as Record<string,unknown>;
  }catch{return reply({error:"INVALID_REQUEST"},400);}
  const {workspaceId,installationId,repositoryId,runId,jobId,attempt,sha,confirmed,typedJobName}=body;
  const uuid=request.headers.get("idempotency-key");
  if(!UUID.test(String(workspaceId??""))||!UUID.test(uuid??"")||
     !positive(installationId)||!positive(repositoryId)||!positive(runId)||
     !positive(jobId)||!positive(attempt)||Number(attempt)>50||
     typeof sha!=="string"||!SHA.test(sha)||confirmed!==true||
     typeof typedJobName!=="string"||typedJobName.length>120){
    return reply({error:"INVALID_REQUEST"},400);
  }
  const supabase=await createSupabaseServerClient();
  if(!supabase)return reply({error:"AUTH_UNAVAILABLE"},503);
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return reply({error:"AUTH_REQUIRED"},401);
  const {data:member,error:memberError}=await supabase.from("workspace_members").select("role")
    .eq("workspace_id",String(workspaceId)).eq("user_id",user.id).maybeSingle();
  if(memberError)return reply({error:"WORKSPACE_UNAVAILABLE"},503);
  if(!member||!["owner","admin"].includes(member.role))return reply({error:"WORKSPACE_FORBIDDEN"},403);
  const {data:installation,error:installError}=await supabase.from("atlas_github_installations")
    .select("installation_id,workspace_id,status,repository_selection,ownership_verified_at,repositories_verified_at")
    .eq("workspace_id",String(workspaceId)).eq("installation_id",Number(installationId)).maybeSingle();
  if(installError)return reply({error:"CONNECTIONS_UNAVAILABLE"},503);
  if(!installation||installation.status!=="repositories-ready"||
     !installation.ownership_verified_at||!installation.repositories_verified_at||
     !["selected","all"].includes(installation.repository_selection))return reply({error:"GITHUB_NOT_AUTHORIZED"},403);
  if(installation.repository_selection==="selected"){
    const {data:grant,error:grantError}=await supabase.from("atlas_github_authorized_repositories")
      .select("repository_id").eq("installation_id",Number(installationId))
      .eq("repository_id",Number(repositoryId)).maybeSingle();
    if(grantError)return reply({error:"CONNECTIONS_UNAVAILABLE"},503);
    if(!grant)return reply({error:"GITHUB_NOT_AUTHORIZED"},403);
  }
  const config=githubConnectSettings();
  if(!config)return reply({error:"GITHUB_NOT_CONFIGURED"},503);
  let writer:Awaited<ReturnType<typeof createGitHubActionsWriter>>;
  let target:GitHubActionsTarget;
  try{
    writer=await createGitHubActionsWriter({installationId:Number(installationId),
      repositoryId:Number(repositoryId),appId:config.appId,privateKey:config.appPrivateKey});
    target=await writer.verifyFailedJob({runId:Number(runId),jobId:Number(jobId),
      attempt:Number(attempt),sha});
  }catch(e){const code=e instanceof GitHubReadError?e.code:"PROVIDER_UNAVAILABLE";
    return reply({error:code},["PERMISSION_DENIED","RUN_CHANGED_OR_UNSAFE","JOB_CHANGED_OR_UNSAFE"].includes(code)?403:503);
  }
  if(target.jobName!==typedJobName || !target.jobName)return reply({error:"CONFIRMATION_MISMATCH"},409);

  // This service-role-only RPC atomically checks workspace roles, installation
  // grant, job identity and idempotency before any provider POST.
  const admin=adminGitHubClient(config);
  const {data:reserved,error:reserveError}=await admin.rpc("atlas_gh_actions_reserve",{
    p_workspace_id:workspaceId,p_actor_id:user.id,p_installation_id:installationId,
    p_repository_id:repositoryId,p_run_id:runId,p_job_id:jobId,
    p_run_attempt:attempt,p_head_sha:sha.toLowerCase(),p_idempotency_key:uuid,
  });
  if(reserveError||!Array.isArray(reserved)||!reserved[0]?.operation_id)
    return reply({error:"RERUN_ALREADY_REQUESTED_OR_UNAVAILABLE"},409);
  const op=reserved[0];
  if(op.already_exists)return reply({error:"RERUN_ALREADY_REQUESTED",state:op.operation_state},409);
  const advance=async(expected:string,next:string,code?:string)=>{
    const result=await admin.rpc("atlas_gh_actions_advance",{
      p_operation_id:op.operation_id,p_expected_state:expected,p_next_state:next,
      p_failure_code:code??null,
    });
    return !result.error&&result.data===next;
  };
  // Re-check live status after obtaining the DB single-flight lease.
  try {
    await writer.verifyFailedJob({runId:Number(runId),jobId:Number(jobId),
      attempt:Number(attempt),sha});
  }catch {
    await advance("reserved","rejected","JOB_CHANGED");
    return reply({error:"JOB_CHANGED_OR_UNSAFE"},409);
  }
  if(!await advance("reserved","dispatching"))
    return reply({error:"RERUN_STATE_CONFLICT"},409);
  try {
    await writer.dispatchJob(target);
    if(!await advance("dispatching","accepted"))
      return reply({error:"RERUN_RECONCILIATION_REQUIRED",operationId:op.operation_id},202);
    return reply({operationId:op.operation_id,state:"accepted",jobId},201);
  }catch {
    // Never automatically retry an ambiguous GitHub write. The audit state is
    // preserved and a human can inspect the exact run on GitHub.
    await advance("dispatching","reconciliation_required","PROVIDER_UNCERTAIN");
    return reply({error:"RERUN_RECONCILIATION_REQUIRED",operationId:op.operation_id},202);
  }
}
