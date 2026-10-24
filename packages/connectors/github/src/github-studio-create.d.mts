export declare class GitHubStudioError extends Error {
  code: string;
  constructor(code: string);
}
export interface RepositoryDraft {
  workspaceId: string;
  installationId: number;
  name: string;
  description: string;
  private: boolean;
  autoInit: boolean;
}
export declare function parseRepositoryDraft(input: unknown): Readonly<RepositoryDraft>;
export declare function verifiedPersonalInstallation(
  binding: unknown, workspaceId: string, installationId: number
): boolean;
export declare function createPersonalRepository(args: {
  workspaceId: string;
  installationId: number;
  binding: unknown;
  draft: Partial<RepositoryDraft> & { name: string };
  appId: string;
  privateKey: string;
  request?: typeof fetch;
  now?: () => number;
}): Promise<Readonly<{
  repositoryId: number;
  fullName: string;
  url: string;
  private: boolean;
  reconciliationRequired: true;
}>>;
