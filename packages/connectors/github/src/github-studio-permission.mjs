import { createGitHubAppJwt } from "./github-app-client.mjs";
import { GitHubStudioError, verifiedPersonalInstallation } from "./github-studio-create.mjs";

const API = "https://api.github.com";
const positive = (n) => Number.isSafeInteger(n) && n > 0;

/**
 * Read-only proof of the installation's effective Repository creation permission.
 * App settings alone are NOT proof the installation owner approved a change.
 * Never creates a repository, mints a user token, or modifies GitHub settings.
 */
export async function readStudioCreationPermission({
  workspaceId, installationId, binding, appId, privateKey,
  request = fetch, now = () => Date.now(),
}) {
  if (!positive(installationId) ||
      !verifiedPersonalInstallation(binding, workspaceId, installationId)) {
    throw new GitHubStudioError("GITHUB_NOT_AUTHORIZED");
  }
  let jwt;
  try { jwt = createGitHubAppJwt({ appId, privateKey, now }); }
  catch { throw new GitHubStudioError("NOT_CONFIGURED"); }
  let response;
  try {
    response = await request(`${API}/app/installations/${installationId}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      redirect: "error", cache: "no-store",
    });
  } catch { throw new GitHubStudioError("PROVIDER_UNAVAILABLE"); }
  if (!response?.ok) {
    throw new GitHubStudioError(response?.status === 403 ? "PERMISSION_DENIED"
      : "PROVIDER_UNAVAILABLE");
  }
  let installation;
  try { installation = await response.json(); }
  catch { throw new GitHubStudioError("INVALID_RESPONSE"); }

  if (installation?.id !== installationId ||
      installation?.target_type !== "User" ||
      typeof installation?.account?.login !== "string" ||
      !/^[A-Za-z0-9-]{1,39}$/.test(installation.account.login) ||
      installation?.suspended_at ||
      installation?.repository_selection !== binding.repositorySelection) {
    throw new GitHubStudioError("GITHUB_NOT_AUTHORIZED");
  }
  return Object.freeze({
    status: installation.permissions?.repository_creation === "write" ? "granted" : "missing",
  });
}
