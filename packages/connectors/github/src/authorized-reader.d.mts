import type { createGitHubReadClient, GitHubFetch } from "./github-app-client.mjs";

export type VerifiedInstallationBinding = {
  tenantId: string;
  installationId: number;
  status: "repositories-ready" | "active" | "pending-ownership-check" | "selection-rejected" | string;
  repositorySelection: "selected" | "all" | null;
  repositories: Array<{ id: number }>;
};

export function createAuthorizedGitHubReader(input: {
  tenantId: string;
  installationId: number;
  lookup: (input: { tenantId: string; installationId: number }) =>
    Promise<VerifiedInstallationBinding | null | undefined>;
  appId: string | number;
  privateKey: string;
  request?: GitHubFetch;
  now?: () => number;
}): Promise<ReturnType<typeof createGitHubReadClient>>;
