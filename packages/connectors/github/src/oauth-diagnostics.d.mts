/** Safe, allowlisted OAuth failure categories for redirect URLs. */
export type GithubOAuthStage = "exchange" | "verification" | "persistence";
export function githubOAuthFailureOutcome(stage: GithubOAuthStage, reason: string): string;
