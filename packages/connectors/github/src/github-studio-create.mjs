import { createGitHubAppJwt } from "./github-app-client.mjs";

const API = "https://api.github.com";
const VERSION = "2026-03-10";
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GitHubStudioError extends Error {
  constructor(code) {
    super(code);
    this.name = "GitHubStudioError";
    this.code = code;
  }
}

const invalid = () => { throw new GitHubStudioError("INVALID_INPUT"); };
const validId = (n) => Number.isSafeInteger(n) && n > 0;
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);

export function parseRepositoryDraft(value) {
  if (!record(value) || Object.keys(value).some((k) =>
    !["workspaceId", "installationId", "name", "description", "private", "autoInit"].includes(k))) invalid();
  if (!UUID.test(value.workspaceId ?? "") || !validId(value.installationId) ||
      typeof value.name !== "string" || !NAME.test(value.name) ||
      value.name === "." || value.name === ".." ||
      (own(value, "description") && (typeof value.description !== "string" || value.description.length > 350)) ||
      (own(value, "private") && typeof value.private !== "boolean") ||
      (own(value, "autoInit") && typeof value.autoInit !== "boolean")) invalid();
  return Object.freeze({
    workspaceId: value.workspaceId,
    installationId: value.installationId,
    name: value.name,
    description: value.description ?? "",
    private: value.private ?? true,
    autoInit: value.autoInit ?? true,
  });
}

export function verifiedPersonalInstallation(binding, workspaceId, installationId) {
  return Boolean(record(binding) &&
    binding.workspaceId === workspaceId &&
    binding.installationId === installationId &&
    binding.status === "repositories-ready" &&
    ["selected", "all"].includes(binding.repositorySelection) &&
    binding.ownershipVerifiedAt && binding.repositoriesVerifiedAt);
}

function headers(token) {
  return { Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": VERSION };
}

async function checkedResponse(request, url, init) {
  let response;
  try { response = await request(url, { ...init, cache: "no-store" }); }
  catch { throw new GitHubStudioError("PROVIDER_UNAVAILABLE"); }
  if (!response?.ok) {
    const status = response?.status;
    if (status === 401) throw new GitHubStudioError("AUTH_REQUIRED");
    if (status === 403) throw new GitHubStudioError(
      response.headers?.get("x-ratelimit-remaining") === "0" ||
      response.headers?.has("retry-after") ? "RATE_LIMITED" : "PERMISSION_DENIED");
    if (status === 404) throw new GitHubStudioError("NOT_FOUND_OR_HIDDEN");
    if (status === 409) throw new GitHubStudioError("CONFLICT");
    if (status === 422) throw new GitHubStudioError("VALIDATION_FAILED");
    if (status === 429) throw new GitHubStudioError("RATE_LIMITED");
    throw new GitHubStudioError(status >= 500 ? "PROVIDER_UNAVAILABLE" : "GITHUB_REJECTED");
  }
  try { return await response.json(); }
  catch { throw new GitHubStudioError("INVALID_RESPONSE"); }
}

/**
 * GitHub Studio M1 provider foundation. Not yet wired to an HTTP mutation route.
 * Caller MUST verify Supabase session/role and server-side tenant binding; this
 * method additionally verifies installation account and effective App permission.
 * No automatic retries on POST: a timeout may occur after GitHub created a repo.
 */
export async function createPersonalRepository({
  workspaceId, installationId, binding, draft, appId, privateKey, userAccessToken,
  request = fetch, now = () => Date.now(),
}) {
  if (!validId(installationId) || !verifiedPersonalInstallation(binding, workspaceId, installationId)) {
    throw new GitHubStudioError("PERMISSION_DENIED");
  }
  const spec = parseRepositoryDraft({ ...draft, workspaceId, installationId });
  // POST /user/repos is a user-authenticated operation on GitHub.com.
  // An installation token is NOT a substitute for a user access token.
  if (typeof userAccessToken !== "string" || !userAccessToken.trim()) {
    throw new GitHubStudioError("USER_TOKEN_REQUIRED");
  }
  if (!appId || !privateKey) throw new GitHubStudioError("NOT_CONFIGURED");
  let jwt;
  try { jwt = createGitHubAppJwt({ appId, privateKey, now }); }
  catch { throw new GitHubStudioError("NOT_CONFIGURED"); }

  // Account ownership is proven by GitHub, never by a browser-provided owner.
  const installation = await checkedResponse(request, `${API}/app/installations/${installationId}`, {
    method: "GET", headers: headers(jwt),
  });
  if (installation?.id !== installationId || installation?.target_type !== "User" ||
      !NAME.test(installation?.account?.login ?? "") || installation.suspended_at ||
      installation.permissions?.repository_creation !== "write") {
    throw new GitHubStudioError("PERMISSION_DENIED");
  }

  // User access token must be obtained through a separate approved GitHub
  // App user OAuth flow, held only by the trusted server, never in the request
  // body or browser. Verify the authorized user's actual GitHub identity.
  const actor = await checkedResponse(request, `${API}/user`, {
    method: "GET", headers: headers(userAccessToken),
  });
  if (actor?.login !== installation.account.login || actor?.type !== "User") {
    throw new GitHubStudioError("PERMISSION_DENIED");
  }

  // Do NOT retry automatically. Caller must persist/reconcile before more writes.
  const created = await checkedResponse(request, `${API}/user/repos`, {
    method: "POST",
    headers: { ...headers(userAccessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: spec.name, description: spec.description,
      private: spec.private, auto_init: spec.autoInit,
    }),
  });
  if (!validId(created?.id) || typeof created?.full_name !== "string" ||
      created.full_name !== `${installation.account.login}/${spec.name}` ||
      created.owner?.login !== installation.account.login ||
      created.private !== spec.private ||
      created.html_url !== `https://github.com/${created.full_name}`) {
    // Mutation might have succeeded; do not attempt to delete or retry.
    throw new GitHubStudioError("RECONCILIATION_REQUIRED");
  }
  return Object.freeze({ repositoryId: created.id, fullName: created.full_name,
    url: created.html_url, private: created.private, reconciliationRequired: true });
}
