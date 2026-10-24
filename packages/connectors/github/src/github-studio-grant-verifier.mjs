import { createGitHubAppJwt } from "./github-app-client.mjs";
import { GitHubStudioError, verifiedPersonalInstallation } from "./github-studio-create.mjs";

const API = "https://api.github.com";
const VERSION = "2026-03-10";
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const headers = (token) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": VERSION,
  Authorization: `Bearer ${token}`,
});

async function readJson(request, url, init) {
  let response;
  try {
    response = await request(url, { ...init, cache: "no-store", redirect: "error" });
  } catch {
    throw new GitHubStudioError("PROVIDER_UNAVAILABLE");
  }
  if (!response?.ok) {
    if (response?.status === 401) throw new GitHubStudioError("AUTH_REQUIRED");
    if (response?.status === 404 || response?.status === 422) {
      throw new GitHubStudioError("GITHUB_NOT_AUTHORIZED");
    }
    if (response?.status === 403 || response?.status === 429) {
      throw new GitHubStudioError("PERMISSION_DENIED");
    }
    throw new GitHubStudioError("PROVIDER_UNAVAILABLE");
  }
  try { return await response.json(); }
  catch { throw new GitHubStudioError("INVALID_RESPONSE"); }
}

/**
 * Explicit, fresh GitHub App access proof for an exact repository ID.
 * This is a server-only collaborator for the GitHub Studio coordinator;
 * a token minted for an ungranted repository MUST be rejected by GitHub.
 *
 * Never falls back to the prior local workspace grant or public repo access.
 * Never exposes the short-lived installation token to the caller.
 */
export async function verifyCreatedRepositoryAccess({
  workspaceId, installationId, binding, created, appId, privateKey,
  request = fetch, now = () => Date.now(),
}) {
  if (!positive(installationId) ||
      !verifiedPersonalInstallation(binding, workspaceId, installationId) ||
      !positive(created?.repositoryId) ||
      typeof created?.fullName !== "string" ||
      typeof created?.url !== "string") {
    throw new GitHubStudioError("PERMISSION_DENIED");
  }
  const parts = created.fullName.split("/");
  if (parts.length !== 2 || !parts.every((x) => NAME.test(x)) ||
      created.url !== `https://github.com/${created.fullName}`) {
    throw new GitHubStudioError("INVALID_INPUT");
  }
  let jwt;
  try { jwt = createGitHubAppJwt({ appId, privateKey, now }); }
  catch { throw new GitHubStudioError("NOT_CONFIGURED"); }

  // A previous workspace binding is not proof of *current* GitHub access.
  const installation = await readJson(request,
    `${API}/app/installations/${installationId}`,
    { method: "GET", headers: headers(jwt) });
  if (installation?.id !== installationId ||
      installation?.target_type !== "User" ||
      installation?.account?.login !== parts[0] ||
      installation?.suspended_at ||
      installation?.repository_selection !== binding.repositorySelection ||
      installation?.permissions?.repository_creation !== "write") return false;

  // Restrict the token to EXACTLY this numeric repository ID, with no
  // additional repository permissions. An ungranted ID cannot be added.
  const grant = await readJson(request,
    `${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: { ...headers(jwt), "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_ids: [created.repositoryId],
        permissions: {},
      }),
    });
  if (typeof grant?.token !== "string" || !grant.token ||
      !Number.isFinite(Date.parse(grant.expires_at)) ||
      Date.parse(grant.expires_at) <= now()) return false;
  if (Array.isArray(grant.repositories) &&
      (grant.repositories.length !== 1 ||
        grant.repositories[0]?.id !== created.repositoryId)) return false;

  // The installed token, not an anonymous/public request, must establish
  // repository presence and ownership. Its repository list is restricted.
  const listing = await readJson(request,
    `${API}/installation/repositories?per_page=100`,
    { method: "GET", headers: headers(grant.token) });
  if (!Array.isArray(listing?.repositories) ||
      listing.total_count !== 1 || listing.repositories.length !== 1) return false;
  const repo = listing.repositories[0];
  return repo?.id === created.repositoryId &&
    repo?.full_name === created.fullName &&
    repo?.owner?.login === parts[0] &&
    repo?.html_url === created.url;
}
