/** Linear OAuth and capabilities for the first server-side integration slice. */
export const linearOAuthScopes = ["read", "issues:create", "comments:create"] as const;

export type LinearOAuthScope = (typeof linearOAuthScopes)[number];
export type LinearCapability =
  | "teams.read"
  | "projects.read"
  | "cycles.read"
  | "issues.read"
  | "issues.create"
  | "comments.create";

export type LinearWorkspaceRole = "owner" | "admin" | "member";

export const linearCapabilityScopes: Readonly<Record<LinearCapability, readonly LinearOAuthScope[]>> = {
  "teams.read": ["read"],
  "projects.read": ["read"],
  "cycles.read": ["read"],
  "issues.read": ["read"],
  "issues.create": ["issues:create"],
  "comments.create": ["comments:create"],
};

/** Write scopes are explicit and narrow; broad `write` and `admin` are not requested. */
export const linearMvpContract = {
  provider: "linear",
  authentication: "oauth2-authorization-code-pkce",
  api: "https://api.linear.app/graphql",
  authorization: "https://linear.app/oauth/authorize",
  token: "https://api.linear.app/oauth/token",
  defaultScopes: ["read"],
  supportedScopes: linearOAuthScopes,
  capabilities: Object.keys(linearCapabilityScopes) as LinearCapability[],
  workspaceBinding: "verified-local-membership-and-exact-linked-linear-workspace-id",
  secretHandling: "server-only; access and refresh tokens must be encrypted at rest before persistence",
  writesEnabled: false,
} as const;
