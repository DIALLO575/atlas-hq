import { createGitHubReadClient, GitHubReadError, mintReadOnlyInstallationToken } from "./github-app-client.mjs";

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Strict boundary between the previously implemented SHA-113 installation workflow
 * and the GitHub App REST client. The lookup MUST be a server-side, tenant-scoped,
 * durable record written only after the real GitHub ownership and repository checks.
 *
 * No browser callback value or caller-provided repository ID is accepted as evidence.
 */
export async function createAuthorizedGitHubReader({
  tenantId, installationId, lookup, appId, privateKey, request = fetch, now = () => Date.now(),
}) {
  if (typeof tenantId !== "string" || !tenantId.trim() || !positiveInteger(installationId) ||
      typeof lookup !== "function") {
    throw new GitHubReadError("INVALID_INPUT", "Authenticated tenant and installation lookup are required");
  }
  let record;
  try {
    record = await lookup({ tenantId, installationId });
  } catch {
    throw new GitHubReadError("PROVIDER_UNAVAILABLE", "Installation authorization store is unavailable");
  }
  if (!record || record.tenantId !== tenantId || record.installationId !== installationId ||
      record.status !== "repositories-ready" ||
      !["selected", "all"].includes(record.repositorySelection) ||
      !Array.isArray(record.repositories) ||
      (record.repositorySelection === "selected" && record.repositories.length === 0) ||
      (record.repositorySelection === "all" && record.repositories.length !== 0)) {
    throw new GitHubReadError("PERMISSION_DENIED", "GitHub installation is not verified for this workspace");
  }
  const repositoryIds = record.repositories.map((repo) => repo?.id);
  if (repositoryIds.some((id) => !positiveInteger(id)) || new Set(repositoryIds).size !== repositoryIds.length) {
    throw new GitHubReadError("INVALID_RESPONSE", "Stored repository authorization is invalid");
  }
  // The installation token is never returned to the caller. Only bounded read tools are exposed.
  const { token } = await mintReadOnlyInstallationToken({
    appId, privateKey, installationId, repositoryIds,
    repositorySelection: record.repositorySelection, request, now,
  });
  return createGitHubReadClient({
    token, installationId, repositoryIds, repositorySelection: record.repositorySelection, request,
  });
}
