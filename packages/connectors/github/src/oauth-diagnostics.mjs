/** Only diagnostic categories; never put GitHub credentials, OAuth codes or exception details in URLs. */
const safeOutcomes = Object.freeze({
  GITHUB_OAUTH_INVALID: "oauth-invalid",
  GITHUB_INSTALLATION_NOT_OWNED: "installation-not-owned",
  GITHUB_INSTALLATION_SUSPENDED: "installation-suspended",
  GITHUB_REPOSITORY_SELECTION_REQUIRED: "select-repositories",
  GITHUB_PULL_REQUESTS_PERMISSION_REQUIRED: "pull-request-permission-required",
  GITHUB_NO_REPOSITORIES: "no-repositories",
  GITHUB_INCOMPLETE_SELECTION: "selection-incomplete",
  GITHUB_SELECTION_TOO_LARGE: "selection-too-large",
  GITHUB_INVALID_PAGINATION: "selection-incomplete",
  GITHUB_NETWORK_UNAVAILABLE: "github-unavailable",
  GITHUB_API_UNAVAILABLE: "github-unavailable",
  GITHUB_INVALID_RESPONSE: "github-unavailable",
});

/** Pure, allowlisted outcome mapper for the user's GitHub OAuth callback. */
export function githubOAuthFailureOutcome(stage, reason) {
  if (stage === "persistence") return "storage-unavailable";
  if (stage === "exchange" && reason === "GITHUB_OAUTH_INVALID") return "oauth-invalid";
  if (stage === "exchange") return "github-unavailable";
  if (stage !== "verification") return "verification-failed";
  return Object.hasOwn(safeOutcomes, reason) ? safeOutcomes[reason] : "verification-failed";
}
