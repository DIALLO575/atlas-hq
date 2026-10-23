export class GitHubReadError extends Error {
  code: "INVALID_INPUT" | "NOT_CONFIGURED" | "AUTH_REQUIRED" | "RATE_LIMITED" | "PERMISSION_DENIED" | "NOT_FOUND_OR_HIDDEN" | "PROVIDER_UNAVAILABLE" | "GITHUB_REJECTED" | "INVALID_RESPONSE" | "INCOMPLETE";
  constructor(code: GitHubReadError["code"], message: string);
}
export type GitHubFetch = (url: string, init?: RequestInit) => Promise<Response>;
export function createGitHubAppJwt(input: {
  appId: string | number;
  privateKey: string;
  now?: () => number;
}): string;
export function mintReadOnlyInstallationToken(input: {
  appId: string | number;
  privateKey: string;
  installationId: number;
  repositoryIds: number[];
  request?: GitHubFetch;
  now?: () => number;
}): Promise<{ token: string; expiresAt: string }>;
export type GitHubRepository = {
  id: number; fullName: string; private: boolean; defaultBranch: string | null; htmlUrl: string;
};
export type GitHubPullSummary = {
  number: number; title: string; state: string; draft: boolean; headSha: string | null;
  updatedAt: string | null; htmlUrl: string;
};
export type GitHubPullDetail = {
  resource: {
    provider: "github"; installationId: number; repositoryId: number; owner: string; repository: string;
    pullRequestNumber: number; headSha: string;
  };
  title: string; body: string | null; state: string; draft: boolean; merged: boolean;
  updatedAt: string | null;
  files: Array<{ path: string; status: string; additions: number; deletions: number; patch: string | null }>;
  filesTruncated: boolean; htmlUrl: string;
};
export function createGitHubReadClient(input: {
  token: string; installationId: number; repositoryIds: number[]; request?: GitHubFetch;
}): {
  listRepositories(): Promise<{ repositories: GitHubRepository[]; truncated: boolean }>;
  listPullRequests(repositoryId: number): Promise<{ repository: GitHubRepository; pullRequests: GitHubPullSummary[]; truncated: boolean }>;
  getPullRequest(repositoryId: number, pullNumber: number): Promise<GitHubPullDetail>;
};
