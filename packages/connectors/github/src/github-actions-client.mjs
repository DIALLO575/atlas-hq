import { createGitHubAppJwt, GitHubReadError } from "./github-app-client.mjs";

const ORIGIN = "https://api.github.com";
const VERSION = "2026-03-10";
const safeId = (value) => Number.isSafeInteger(value) && value > 0;
const validName = (v) => typeof v === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(v);
const fail = (code) => { throw new GitHubReadError(code, "GitHub Actions unavailable"); };
const headers = (token) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": VERSION,
});

async function json(request, url, options, context = "generic") {
  let response;
  try { response = await request(url, { ...options, redirect: "error", cache: "no-store" }); }
  catch { fail("PROVIDER_UNAVAILABLE"); }
  if (!response?.ok) {
    const status = response?.status;
    if (status === 401) fail("AUTH_REQUIRED");
    if (status === 403 && (response.headers?.get?.("x-ratelimit-remaining") === "0" || response.headers?.has?.("retry-after"))) fail("RATE_LIMITED");
    if (status === 403 || status === 422) fail(context === "mint" ? "INSTALLATION_SCOPE_REJECTED" : context === "actions" ? "ACTIONS_API_FORBIDDEN" : "PERMISSION_DENIED");
    if (status === 404) fail("NOT_FOUND_OR_HIDDEN");
    if (status === 429) fail("RATE_LIMITED");
    fail(status >= 500 ? "PROVIDER_UNAVAILABLE" : "GITHUB_REJECTED");
  }
  try { return await response.json(); }
  catch { fail("INVALID_RESPONSE"); }
}

const cleanStatus = (s) => ["queued","in_progress","completed","waiting","pending","requested"].includes(s)
  ? s : "unknown";
const cleanConclusion = (s) =>
  ["success","failure","cancelled","timed_out","skipped","neutral","action_required","stale"].includes(s) ? s : null;
const clipped = (s, max = 160) => typeof s === "string" ? s.slice(0,max) : "";
function normalizeRun(run, repo) {
  if (!safeId(run?.id)) fail("INVALID_RESPONSE");
  return Object.freeze({
    id: run.id, name: clipped(run.name, 120),
    title: clipped(run.display_title, 160), status: cleanStatus(run.status),
    conclusion: cleanConclusion(run.conclusion), attempt: safeId(run.run_attempt) ? run.run_attempt : 1,
    branch: clipped(run.head_branch, 140), sha: /^[a-f0-9]{40}$/i.test(run.head_sha ?? "") ? run.head_sha : null,
    event: clipped(run.event, 60), createdAt: run.created_at ?? null,
    updatedAt: run.updated_at ?? null,
    url: `https://github.com/${repo}/actions/runs/${run.id}`,
  });
}
function normalizeJob(job, repo, runId) {
  if (!safeId(job?.id)) fail("INVALID_RESPONSE");
  return Object.freeze({
    id: job.id, name: clipped(job.name, 150),
    status: cleanStatus(job.status), conclusion: cleanConclusion(job.conclusion),
    startedAt: job.started_at ?? null, completedAt: job.completed_at ?? null,
    failedSteps: Array.isArray(job.steps) ? job.steps.filter((s) =>
      ["failure","timed_out","cancelled","action_required"].includes(s?.conclusion)).slice(0,30).map((step) => ({
      number: safeId(step.number) ? step.number : null,
      name: clipped(step.name, 150), conclusion: cleanConclusion(step.conclusion),
    })) : [],
    url: `https://github.com/${repo}/actions/runs/${runId}/job/${job.id}`,
  });
}

/**
 * Single-repo scoped read-only Actions adapter. A 422 from GitHub's token
 * endpoint means repo ID is outside the App installation's live grant.
 * Do not use a public endpoint or an unscoped token as a fallback.
 */
export async function createGitHubActionsReader({
  installationId, repositoryId, appId, privateKey,
  request = fetch, now = () => Date.now(),
}) {
  if (!safeId(installationId) || !safeId(repositoryId)) fail("INVALID_INPUT");
  const jwt = createGitHubAppJwt({ appId, privateKey, now });
  const minted = await json(request,
    `${ORIGIN}/app/installations/${installationId}/access_tokens`, {
      method:"POST", headers:{...headers(jwt),"Content-Type":"application/json"},
      body:JSON.stringify({ repository_ids:[repositoryId], permissions:{actions:"read"} }),
    }, "mint");
  if (typeof minted?.token !== "string" || !minted.token ||
      !Number.isFinite(Date.parse(minted.expires_at)) || Date.parse(minted.expires_at) <= now()) fail("INVALID_RESPONSE");
  // A token scope mismatch does not prove the GitHub App lacks Actions permission.
  if (minted.permissions?.actions !== "read") fail("ACTIONS_TOKEN_SCOPE_UNVERIFIED");
  if (Array.isArray(minted.repositories) &&
      (minted.repositories.length !== 1 || minted.repositories[0]?.id !== repositoryId)) {
    fail("PERMISSION_DENIED");
  }

  // Check the actual grant using the restricted token itself, not public data.
  const listing = await json(request,`${ORIGIN}/installation/repositories?per_page=100`,{
    method:"GET",headers:headers(minted.token),
  });
  if (listing?.total_count !== 1 || !Array.isArray(listing.repositories) ||
      listing.repositories.length !== 1) fail("PERMISSION_DENIED");
  const repo = listing.repositories[0];
  if (repo?.id !== repositoryId || typeof repo.full_name !== "string" ||
      repo.full_name.split("/").length !== 2 ||
      !repo.full_name.split("/").every(validName) ||
      repo.owner?.login !== repo.full_name.split("/")[0]) fail("PERMISSION_DENIED");
  const fullName = repo.full_name;

  async function listRuns() {
    const data = await json(request,
      `${ORIGIN}/repos/${fullName}/actions/runs?per_page=20&page=1`,{
        method:"GET",headers:headers(minted.token),
      }, "actions");
    if (!Array.isArray(data?.workflow_runs) || !Number.isSafeInteger(data.total_count)) {
      fail("INVALID_RESPONSE");
    }
    return Object.freeze({
      repository:{ id:repositoryId, fullName },
      runs:data.workflow_runs.slice(0,20).map((item)=>normalizeRun(item,fullName)),
      truncated:data.total_count>20,
    });
  }
  async function listJobs(runId) {
    if (!safeId(runId)) fail("INVALID_INPUT");
    // We verify the run belongs to this exact repository before returning jobs.
    const run = await json(request,`${ORIGIN}/repos/${fullName}/actions/runs/${runId}`,{
      method:"GET",headers:headers(minted.token),
    }, "actions");
    if (run?.id !== runId || run?.repository?.id !== repositoryId) fail("PERMISSION_DENIED");
    const data = await json(request,
      `${ORIGIN}/repos/${fullName}/actions/runs/${runId}/jobs?per_page=100&filter=latest`,{
        method:"GET",headers:headers(minted.token),
      }, "actions");
    if (!Array.isArray(data?.jobs) || !Number.isSafeInteger(data.total_count)) fail("INVALID_RESPONSE");
    if (data.jobs.slice(0,100).some((job)=>job?.run_id !== undefined && job.run_id !== runId)) {
      fail("INVALID_RESPONSE");
    }
    return Object.freeze({
      run:normalizeRun(run,fullName),
      jobs:data.jobs.slice(0,100).map((j)=>normalizeJob(j,fullName,runId)),
      truncated:data.total_count>100,
    });
  }
  return Object.freeze({listRuns,listJobs});
}
