import { createPrivateKey, sign } from "node:crypto";
import { getNextPageUrl } from "./pagination-contract.mjs";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_REPOSITORIES = 500;

export class GitHubReadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitHubReadError";
    this.code = code;
  }
}

function positiveId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GitHubReadError("INVALID_INPUT", `${name} must be a positive safe integer`);
  }
  return value;
}

function allowedIds(repositoryIds) {
  if (!Array.isArray(repositoryIds) || repositoryIds.length < 1 || repositoryIds.length > MAX_REPOSITORIES) {
    throw new GitHubReadError("INVALID_INPUT", "A nonempty, bounded list of verified repository IDs is required");
  }
  const ids = new Set(repositoryIds.map((id) => positiveId(id, "repository ID")));
  if (ids.size !== repositoryIds.length) throw new GitHubReadError("INVALID_INPUT", "Duplicate repository IDs");
  return ids;
}

function apiHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

async function jsonResponse(response) {
  if (!response.ok) {
    const code = response.status === 401 ? "AUTH_REQUIRED"
      : response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")) ? "RATE_LIMITED"
      : response.status === 403 ? "PERMISSION_DENIED"
      : response.status === 404 ? "NOT_FOUND_OR_HIDDEN"
      : response.status === 429 ? "RATE_LIMITED"
      : response.status >= 500 ? "PROVIDER_UNAVAILABLE"
      : "GITHUB_REJECTED";
    // Never include GitHub's raw error body; it may expose private details.
    throw new GitHubReadError(code, `GitHub request failed (${response.status})`);
  }
  try {
    return await response.json();
  } catch {
    throw new GitHubReadError("INVALID_RESPONSE", "GitHub returned invalid JSON");
  }
}

export function createGitHubAppJwt({ appId, privateKey, now = () => Date.now() }) {
  if (!/^[1-9][0-9]*$/.test(String(appId ?? "")) || !privateKey || typeof privateKey !== "string") {
    throw new GitHubReadError("NOT_CONFIGURED", "GitHub App credentials are missing");
  }
  const seconds = Math.floor(now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: seconds - 60, exp: seconds + 9 * 60, iss: String(appId) })}`;
  try {
    const signature = sign("RSA-SHA256", Buffer.from(input), createPrivateKey(privateKey.replace(/\\n/g, "\n"))).toString("base64url");
    return `${input}.${signature}`;
  } catch {
    throw new GitHubReadError("NOT_CONFIGURED", "Invalid server-side GitHub App signing key");
  }
}

/**
 * Credentials must come from server-side configuration. Installation and repository
 * IDs must come from a verified tenant binding, never from browser parameters.
 */
export async function mintReadOnlyInstallationToken({
  appId, privateKey, installationId, repositoryIds, repositorySelection = "selected", request = fetch, now = () => Date.now(),
}) {
  positiveId(installationId, "installation ID");
  if (repositorySelection !== "selected" && repositorySelection !== "all") {
    throw new GitHubReadError("INVALID_INPUT", "Unverified repository selection mode");
  }
  if (repositorySelection === "all" && (!Array.isArray(repositoryIds) || repositoryIds.length !== 0)) {
    throw new GitHubReadError("INVALID_INPUT", "All mode must not carry a spoofable repository ID list");
  }
  const ids = repositorySelection === "selected" ? [...allowedIds(repositoryIds)] : [];
  const jwt = createGitHubAppJwt({ appId, privateKey, now });
  let response;
  try {
    response = await request(`${API_ORIGIN}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: { ...apiHeaders(jwt), "Content-Type": "application/json" },
      body: JSON.stringify(repositorySelection === "all"
        ? { permissions: { pull_requests: "read" } }
        : { repository_ids: ids, permissions: { pull_requests: "read" } }),
      cache: "no-store",
    });
  } catch {
    throw new GitHubReadError("PROVIDER_UNAVAILABLE", "GitHub token service unavailable");
  }
  const body = await jsonResponse(response);
  if (typeof body?.token !== "string" || !body.token ||
      !Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= now()) {
    throw new GitHubReadError("INVALID_RESPONSE", "GitHub returned an invalid installation token");
  }
  if (body.permissions?.pull_requests !== "read" && body.permissions?.pull_requests !== "write") {
    throw new GitHubReadError("PERMISSION_DENIED", "GitHub installation lacks Pull requests read permission");
  }
  if (repositorySelection === "selected" &&
      Array.isArray(body.repositories) && body.repositories.some((repo) => !ids.includes(repo.id))) {
    throw new GitHubReadError("INVALID_RESPONSE", "Installation token exceeds approved repository selection");
  }
  return { token: body.token, expiresAt: body.expires_at };
}

function safeNext(link, initialPath) {
  const next = getNextPageUrl(link);
  if (!next) return null;
  try {
    const url = new URL(next);
    return url.origin === API_ORIGIN && url.pathname === initialPath ? url : null;
  } catch {
    return null;
  }
}

function githubName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(name);
}

function mapRepo(repo) {
  if (!positiveRepo(repo)) throw new GitHubReadError("INVALID_RESPONSE", "GitHub returned an invalid repository");
  return {
    id: repo.id,
    fullName: repo.full_name,
    private: repo.private === true,
    defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : null,
    htmlUrl: `https://github.com/${repo.full_name}`,
  };
}

function positiveRepo(repo) {
  return repo && Number.isSafeInteger(repo.id) && repo.id > 0 &&
    typeof repo.full_name === "string" && repo.full_name.split("/").length === 2 &&
    repo.full_name.split("/").every(githubName);
}

export function createGitHubReadClient({ token, installationId, repositoryIds, repositorySelection = "selected", request = fetch }) {
  positiveId(installationId, "installation ID");
  if (typeof token !== "string" || !token.trim()) throw new GitHubReadError("AUTH_REQUIRED", "Installation token missing");
  if (repositorySelection !== "selected" && repositorySelection !== "all") {
    throw new GitHubReadError("INVALID_INPUT", "Invalid installation repository grant mode");
  }
  if (repositorySelection === "all" && (!Array.isArray(repositoryIds) || repositoryIds.length !== 0)) {
    throw new GitHubReadError("INVALID_INPUT", "Untrusted repository IDs in an all-repositories grant");
  }
  const ids = repositorySelection === "selected" ? allowedIds(repositoryIds) : new Set();

  async function get(url) {
    if (url.origin !== API_ORIGIN || !url.pathname.startsWith("/")) throw new GitHubReadError("INVALID_INPUT", "Unsafe GitHub endpoint");
    let response;
    try {
      response = await request(url.toString(), { method: "GET", headers: apiHeaders(token), cache: "no-store" });
    } catch {
      throw new GitHubReadError("PROVIDER_UNAVAILABLE", "GitHub API unavailable");
    }
    return { body: await jsonResponse(response), link: response.headers.get("link") };
  }

  async function pages(path, { maximum, maxPages, arrayKey = null }) {
    const first = new URL(path, API_ORIGIN);
    let url = first;
    const items = [];
    let truncated = false;
    for (let page = 0; page < maxPages && url; page += 1) {
      const { body, link } = await get(url);
      const chunk = arrayKey ? body?.[arrayKey] : body;
      if (!Array.isArray(chunk)) throw new GitHubReadError("INVALID_RESPONSE", "GitHub returned an invalid collection");
      const remaining = maximum - items.length;
      items.push(...chunk.slice(0, remaining));
      const next = safeNext(link, first.pathname);
      if (items.length >= maximum) {
        truncated = Boolean(next) || (maximum === 3000);
        break;
      }
      url = next;
      if (page === maxPages - 1 && url) truncated = true;
    }
    return { items, truncated };
  }

  async function listRepositories() {
    const { items, truncated } = await pages("/installation/repositories?per_page=100", {
      maximum: MAX_REPOSITORIES, maxPages: 6, arrayKey: "repositories",
    });
    return { repositories: items.filter((repo) => repositorySelection === "all" || ids.has(repo?.id)).map(mapRepo), truncated };
  }

  async function checkedRepository(repositoryId) {
    positiveId(repositoryId, "repository ID");
    if (repositorySelection === "selected" && !ids.has(repositoryId)) {
      throw new GitHubReadError("PERMISSION_DENIED", "Repository not granted to this workspace");
    }
    // Even for all-repositories installs, never accept a caller's arbitrary ID.
    // Validate each requested repository against the LIVE installation token's
    // /installation/repositories listing before fetching its PRs.
    const { repositories, truncated } = await listRepositories();
    const repo = repositories.find((item) => item.id === repositoryId);
    if (!repo) {
      if (truncated) throw new GitHubReadError("INCOMPLETE", "Repository authorization listing is incomplete");
      throw new GitHubReadError("PERMISSION_DENIED", "Repository not accessible to this installation");
    }
    return repo;
  }

  async function listPullRequests(repositoryId) {
    const repo = await checkedRepository(repositoryId);
    const { items, truncated } = await pages(`/repos/${repo.fullName}/pulls?state=open&per_page=100`, {
      maximum: 100, maxPages: 1,
    });
    return {
      repository: repo,
      pullRequests: items.map((pr) => ({
        number: positiveId(pr.number, "pull request number"),
        title: typeof pr.title === "string" ? pr.title : "",
        state: pr.state,
        draft: pr.draft === true,
        headSha: pr.head?.sha ?? null,
        updatedAt: pr.updated_at ?? null,
        htmlUrl: `https://github.com/${repo.fullName}/pull/${pr.number}`,
      })),
      truncated,
    };
  }

  async function getPullRequest(repositoryId, pullNumber) {
    const repo = await checkedRepository(repositoryId);
    positiveId(pullNumber, "pull request number");
    const path = `/repos/${repo.fullName}/pulls/${pullNumber}`;
    const { body: pr } = await get(new URL(path, API_ORIGIN));
    if (pr.number !== pullNumber || !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? "")) {
      throw new GitHubReadError("INVALID_RESPONSE", "GitHub returned an invalid pull request revision");
    }
    const { items, truncated } = await pages(`${path}/files?per_page=100`, {
      maximum: 3000, maxPages: 30,
    });
    return {
      resource: { provider: "github", installationId, repositoryId: repo.id, owner: repo.fullName.split("/")[0],
        repository: repo.fullName.split("/")[1], pullRequestNumber: pr.number, headSha: pr.head.sha },
      title: pr.title ?? "",
      body: pr.body ?? null,
      state: pr.state,
      draft: pr.draft === true,
      merged: pr.merged === true,
      updatedAt: pr.updated_at ?? null,
      files: items.map((file) => ({
        path: file.filename, status: file.status, additions: file.additions,
        deletions: file.deletions, patch: typeof file.patch === "string" ? file.patch.slice(0, 12000) : null,
      })),
      filesTruncated: truncated,
      htmlUrl: `https://github.com/${repo.fullName}/pull/${pr.number}`,
    };
  }

  return { listRepositories, listPullRequests, getPullRequest };
}
