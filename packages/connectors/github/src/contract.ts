import type { ConnectorEvent, ReadOnlyConnectorContract, ResourceRef } from "../../../connector-core/src/contracts";

/**
 * GitHub.com MVP contract, verified against GitHub Docs on 2026-10-23.
 * It describes only read operations and webhook shapes ATLAS consumes.
 */
export const githubMvpContract = {
  provider: "github",
  authentication: "github-app-installation-token",
  repositorySelection: "selected-repositories",
  capabilities: [
    "repositories.list",
    "pull_requests.read",
    "pull_requests.files.read",
    "pull_requests.commits.read",
  ],
  permissions: [
    {
      scope: "repository",
      name: "metadata",
      access: "read",
      required: true,
      reason: "GitHub grants Metadata read implicitly; installation repository enumeration needs no additional permission.",
    },
    {
      scope: "repository",
      name: "pull_requests",
      access: "read",
      required: true,
      reason: "Required for listing/getting PRs and listing their changed files and commits.",
    },
  ],
  api: {
    apiVersion: "2026-03-10",
    accept: "application/vnd.github+json",
    pagination: "follow-link-header",
    maxPageSize: 100,
    retry: {
      methods: ["GET", "HEAD"],
      maxAttempts: 3,
      honorRetryAfter: true,
      honorPrimaryRateLimitReset: true,
      secondaryLimitMinimumWaitSeconds: 60,
      exponentialBackoff: true,
    },
  },
  endpoints: [
    {
      capability: "repositories.list",
      method: "GET",
      path: "/installation/repositories",
      requiredPermission: "metadata:read (implicit); no additional installation-token permission",
      events: ["installation", "installation_repositories"],
      risk: "May reveal only repositories granted to this installation; persist installationId/repositoryId and selected access, never assume all account repositories.",
      test: "pagination and repository-selection contract; never calls GitHub in tests",
    },
    {
      capability: "pull_requests.read",
      method: "GET",
      path: "/repos/{owner}/{repo}/pulls/{pull_number}",
      requiredPermission: "pull_requests:read",
      events: ["pull_request:opened", "pull_request:reopened", "pull_request:synchronize", "pull_request:closed"],
      risk: "Payload and head SHA can change; use event delivery identity and re-read current PR before starting a mission; do not treat an event as authorization to write.",
      test: "known PR fixture, unknown action ignored, SHA included in ResourceRef",
    },
    {
      capability: "pull_requests.files.read",
      method: "GET",
      path: "/repos/{owner}/{repo}/pulls/{pull_number}/files",
      requiredPermission: "pull_requests:read",
      events: ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"],
      risk: "Response is paginated and capped at 3,000 files; never imply a complete diff past the documented cap.",
      test: "Link-header pagination and explicit cap handling",
    },
    {
      capability: "pull_requests.commits.read",
      method: "GET",
      path: "/repos/{owner}/{repo}/pulls/{pull_number}/commits",
      requiredPermission: "pull_requests:read",
      events: ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"],
      risk: "Pull-request endpoint lists at most 250 commits; represent that limitation and do not treat list as exhaustive beyond the cap.",
      test: "Link-header pagination and explicit cap handling",
    },
  ],
  events: {
    installation: ["created", "deleted", "suspend", "unsuspend"],
    installation_repositories: ["added", "removed"],
    pull_request: ["opened", "reopened", "synchronize", "closed"],
    ignored: "Unknown event names/actions are acknowledged but not processed; validate webhook signature and delivery id before this contract is used at runtime.",
  },
  responseHandling: {
    success: "200 JSON; use ETag/If-None-Match when available; 304 means unchanged.",
    auth: "401 stops and marks credential/session invalid; do not retry blindly.",
    forbidden: "403 stops; distinguish missing permission from rate limiting using headers/body.",
    notFound: "404 may conceal private-resource access; do not disclose repository existence.",
    validation: "422 is a non-retryable request/validation error.",
    rateLimit: "429 or rate-limited 403: honor Retry-After; if x-ratelimit-remaining=0 wait until x-ratelimit-reset; otherwise wait at least 60 seconds then exponential backoff, with a bounded attempt count.",
    server: "Retry only idempotent GET/HEAD with bounded exponential backoff; surface exhaustion as degraded/error state.",
  },
  excluded: [
    "all writes, including comments, reviews, labels, merges and branch operations",
    "GitHub MCP as an authentication or execution path (experimental follow-up only)",
    "GraphQL until a measured product need justifies it",
    "checks/statuses, issues, contents, organization-wide discovery, and broad repository installation",
  ],
  githubMcp: "V1/experimental and explicitly outside the MVP authentication path",
  writesEnabled: false,
} as const satisfies ReadOnlyConnectorContract & {
  endpoints: readonly {
    capability: string;
    method: "GET";
    path: string;
    requiredPermission: string;
    events: readonly string[];
    risk: string;
    test: string;
  }[];
  events: Record<string, readonly string[] | string>;
  responseHandling: Record<string, string>;
  excluded: readonly string[];
  githubMcp: string;
};

export type GitHubMvpResourceRef = ResourceRef & { provider: "github" };
export type GitHubPullRequestStatus = {
  state: "open" | "closed";
  isDraft: boolean;
  merged: boolean;
};
export type GitHubMvpEvent = ConnectorEvent<{ status: GitHubPullRequestStatus }> & { provider: "github" };

/** Pull request actions accepted by the current MVP mission flow. */
export const consumedPullRequestActions = ["opened", "reopened", "synchronize", "closed"] as const;
export type ConsumedPullRequestAction = (typeof consumedPullRequestActions)[number];

export const webhookDeliveryIdHeader = "X-GitHub-Delivery";
export const webhookSignatureHeader = "X-Hub-Signature-256";
