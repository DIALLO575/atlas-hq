import { createGitHubAppJwt, GitHubReadError } from "./github-app-client.mjs";

const API="https://api.github.com";
const VERSION="2026-03-10";
const id=(x)=>Number.isSafeInteger(x)&&x>0;
const deny=(code)=>{throw new GitHubReadError(code,"GitHub Actions rerun unavailable");};
const headers=(token)=>({
  Accept:"application/vnd.github+json",
  Authorization:`Bearer ${token}`,
  "X-GitHub-Api-Version":VERSION,
});
async function call(request,url,options) {
  let response;
  try {response=await request(url,{...options,redirect:"error",cache:"no-store"});}
  catch {deny("PROVIDER_UNCERTAIN");}
  if (!response || !Number.isInteger(response.status))deny("PROVIDER_UNCERTAIN");
  return response;
}
async function read(request,url,token){
  const res=await call(request,url,{method:"GET",headers:headers(token)});
  if(!res.ok) {
    if(res.status===403||res.status===401||res.status===422)deny("PERMISSION_DENIED");
    if(res.status===404)deny("NOT_FOUND_OR_HIDDEN");
    deny("PROVIDER_UNAVAILABLE");
  }
  try{return await res.json();}catch {deny("INVALID_RESPONSE");}
}
const names=(value)=>typeof value==="string"&&/^[A-Za-z0-9_.-]{1,100}$/.test(value);

/**
 * A separate, scoped Actions:write token is minted ONLY for an explicitly
 * authorized rerun. The normal run inspector still uses Actions:read.
 */
export async function createGitHubActionsWriter({
  installationId,repositoryId,appId,privateKey,request=fetch,now=()=>Date.now(),
}){
  if(!id(installationId)||!id(repositoryId))deny("INVALID_INPUT");
  const jwt=createGitHubAppJwt({appId,privateKey,now});
  const response=await call(request,`${API}/app/installations/${installationId}/access_tokens`,{
    method:"POST",headers:{...headers(jwt),"Content-Type":"application/json"},
    body:JSON.stringify({repository_ids:[repositoryId],permissions:{actions:"write"}}),
  });
  if(!response.ok)deny("PERMISSION_DENIED");
  let tokenData;
  try{tokenData=await response.json();}catch{deny("INVALID_RESPONSE");}
  if(!tokenData?.token||typeof tokenData.token!=="string"||
    tokenData.permissions?.actions!=="write"||
    !Number.isFinite(Date.parse(tokenData.expires_at))||
    Date.parse(tokenData.expires_at)<=now())deny("PERMISSION_DENIED");
  if(Array.isArray(tokenData.repositories) &&
      (tokenData.repositories.length!==1||tokenData.repositories[0]?.id!==repositoryId))deny("PERMISSION_DENIED");
  const token=tokenData.token;
  const listing=await read(request,`${API}/installation/repositories?per_page=100`,token);
  if(listing?.total_count!==1||!Array.isArray(listing.repositories)||
     listing.repositories.length!==1)deny("PERMISSION_DENIED");
  const repo=listing.repositories[0];
  if(repo?.id!==repositoryId||typeof repo.full_name!=="string"||
     repo.full_name.split("/").length!==2||!repo.full_name.split("/").every(names)||
     repo.owner?.login!==repo.full_name.split("/")[0])deny("PERMISSION_DENIED");
  const fullName=repo.full_name;

  async function verifyFailedJob({runId,jobId,attempt,sha}){
    if(!id(runId)||!id(jobId)||!id(attempt)||attempt>50||
       typeof sha!=="string"||!/^[a-f0-9]{40}$/i.test(sha))deny("INVALID_INPUT");
    const run=await read(request,`${API}/repos/${fullName}/actions/runs/${runId}`,token);
    if(run?.id!==runId||run.repository?.id!==repositoryId||
       run.head_repository?.id!==repositoryId||run.status!=="completed"||
       !["failure","timed_out"].includes(run.conclusion)||
       run.run_attempt!==attempt||run.head_sha?.toLowerCase()!==sha.toLowerCase()||
       !["push","workflow_dispatch","pull_request"].includes(run.event)||
       Date.parse(run.created_at)<now()-30*24*3600*1000)deny("RUN_CHANGED_OR_UNSAFE");
    const job=await read(request,`${API}/repos/${fullName}/actions/jobs/${jobId}`,token);
    if(job?.id!==jobId||job.run_id!==runId||
       (job.run_attempt!==undefined&&job.run_attempt!==attempt)||job.status!=="completed"||
       !["failure","timed_out"].includes(job.conclusion))deny("JOB_CHANGED_OR_UNSAFE");
    // The singular job endpoint need not expose run_attempt. Prove membership
    // in the exact attempt rather than trusting a field it may not contain.
    const listing=await read(request,
      `${API}/repos/${fullName}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,token);
    if(!Array.isArray(listing?.jobs)||!listing.jobs.some((entry)=>entry?.id===jobId))
      deny("JOB_CHANGED_OR_UNSAFE");
    return Object.freeze({
      repositoryId,installationId,runId,jobId,attempt,sha:sha.toLowerCase(),
      fullName,runName:String(run.name??"").slice(0,120),jobName:String(job.name??"").slice(0,120),
    });
  }

  async function dispatchJob(job){
    if(job?.repositoryId!==repositoryId||job?.installationId!==installationId||
       job?.fullName!==fullName||!id(job?.jobId))deny("INVALID_INPUT");
    // Only one POST. A timeout is NOT a reason to retry a workflow job.
    const response=await call(request,`${API}/repos/${fullName}/actions/jobs/${job.jobId}/rerun`,{
      method:"POST",headers:{...headers(token),"Content-Type":"application/json"},
      body:JSON.stringify({enable_debug_logging:false,enable_debugger:false}),
    });
    if(response.status===201)return Object.freeze({accepted:true,jobId:job.jobId,runId:job.runId});
    if(response.status===403||response.status===401)deny("PERMISSION_DENIED");
    if(response.status===404)deny("NOT_FOUND_OR_HIDDEN");
    // 409 / 422 / 429 / 5xx are uncertain after a network dispatch.
    deny("PROVIDER_UNCERTAIN");
  }
  return Object.freeze({verifyFailedJob,dispatchJob});
}
