import { getNextPageUrl } from "./pagination-contract.mjs";

const API = "https://api.github.com";
const VERSION = "2026-03-10";
const MAX_REPOS = 500;
const MAX_INSTALLATIONS = 500;
export class GitHubAuthorizationError extends Error {
  constructor(code) {
    super(code);
    this.name = "GitHubAuthorizationError";
    this.code = code;
  }
}
function positiveId(n) {
  return Number.isSafeInteger(n) && n > 0;
}
function headers(token) {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": VERSION };
}
async function responseJson(request, url, init) {
  let response;
  try {
    response = await request(url, { ...init, cache: "no-store", redirect: "error" });
  } catch {
    throw new GitHubAuthorizationError("GITHUB_NETWORK_UNAVAILABLE");
  }
  if (!response.ok) throw new GitHubAuthorizationError(response.status === 401 ? "GITHUB_OAUTH_INVALID" : "GITHUB_API_UNAVAILABLE");
  try {
    return { value: await response.json(), link: response.headers.get("link") };
  } catch {
    throw new GitHubAuthorizationError("GITHUB_INVALID_RESPONSE");
  }
}
async function collection(request, token, pathname, field, cap) {
  let url = new URL(`${API}${pathname}?per_page=100`);
  const records = [];
  for (let i = 0; i < Math.ceil(cap / 100); i += 1) {
    const { value, link } = await responseJson(request, url.toString(), { method: "GET", headers: headers(token) });
    if (!Array.isArray(value?.[field]) || !Number.isSafeInteger(value.total_count)) {
      throw new GitHubAuthorizationError("GITHUB_INVALID_RESPONSE");
    }
    records.push(...value[field]);
    if (records.length > cap || value.total_count > cap) throw new GitHubAuthorizationError("GITHUB_SELECTION_TOO_LARGE");
    const next = getNextPageUrl(link);
    if (!next && typeof link === "string" && /rel\s*=\s*"?next"?/i.test(link)) {
      throw new GitHubAuthorizationError("GITHUB_INVALID_PAGINATION");
    }
    if (!next) {
      if (records.length !== value.total_count) throw new GitHubAuthorizationError("GITHUB_INCOMPLETE_SELECTION");
      return records;
    }
    url = new URL(next);
    if (url.pathname !== pathname || url.origin !== API) throw new GitHubAuthorizationError("GITHUB_INVALID_PAGINATION");
  }
  throw new GitHubAuthorizationError("GITHUB_SELECTION_TOO_LARGE");
}

/** Temporary user token, used only for proof. Never persisted to ATLAS database. */
export async function exchangeGitHubAppCode({ code, clientId, clientSecret, redirectUri, request = fetch }) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{10,512}$/.test(code) ||
      !clientId || !clientSecret || !redirectUri) throw new GitHubAuthorizationError("GITHUB_OAUTH_INVALID");
  const { value } = await responseJson(request, "https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!value || value.error || typeof value.access_token !== "string" || !value.access_token) {
    throw new GitHubAuthorizationError("GITHUB_OAUTH_INVALID");
  }
  return value.access_token;
}

/**
 * Only personal-account installations are supported in this first secure slice.
 * Organization installations require a separate verified organization-admin flow.
 * Merely being a collaborator does NOT grant authority to attach that installation
 * to another ATLAS workspace.
 */
export async function verifyPersonalInstallation({
  userToken, appId, installationId, request = fetch,
}) {
  if (typeof userToken !== "string" || !userToken || !positiveId(Number(appId)) ||
      !positiveId(installationId)) throw new GitHubAuthorizationError("GITHUB_OAUTH_INVALID");
  const { value: person } = await responseJson(request, `${API}/user`, {
    method: "GET", headers: headers(userToken),
  });
  if (!positiveId(person?.id) || typeof person.login !== "string" || !person.login) {
    throw new GitHubAuthorizationError("GITHUB_INVALID_RESPONSE");
  }
  const installations = await collection(request, userToken, "/user/installations", "installations", MAX_INSTALLATIONS);
  const installation = installations.find((item) => item?.id === installationId &&
    item?.app_id === Number(appId) &&
    item?.account?.id === person.id &&
    item?.account?.login?.toLowerCase() === person.login.toLowerCase() &&
    item?.target_type === "User");
  if (!installation) throw new GitHubAuthorizationError("GITHUB_INSTALLATION_NOT_OWNED");
  if (installation.suspended_at || installation.repository_selection !== "selected" ||
      !["read", "write"].includes(installation.permissions?.pull_requests)) {
    throw new GitHubAuthorizationError("GITHUB_INSTALLATION_PERMISSIONS");
  }
  const repositoryPath = `/user/installations/${installationId}/repositories`;
  const repositories = await collection(request, userToken, repositoryPath, "repositories", MAX_REPOS);
  if (!repositories.length) throw new GitHubAuthorizationError("GITHUB_NO_REPOSITORIES");
  const ids = repositories.map((repo) => repo?.id);
  if (ids.some((id) => !positiveId(id)) || new Set(ids).size !== ids.length) {
    throw new GitHubAuthorizationError("GITHUB_INVALID_RESPONSE");
  }
  return {
    installationId,
    repositoryIds: ids,
    accountLogin: person.login,
  };
}

export function githubUserOAuthUrl({ clientId, redirectUri, state }) {
  if (!clientId || !redirectUri || !state) throw new GitHubAuthorizationError("GITHUB_OAUTH_INVALID");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}
