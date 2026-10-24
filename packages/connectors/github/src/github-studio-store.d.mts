export interface RepositoryStudioIntent {
  workspaceId: string;
  actorId: string;
  installationId: number;
  idempotencyKey: string;
  action: "repository.create";
  digest: string;
  draft: { name: string; private: boolean };
}
export declare function createGitHubStudioOperationStore(args: {
  rpc: (method: string, payload: Record<string, unknown>) =>
    Promise<{ data: unknown; error?: unknown }>;
}): {
  reserve(intent: RepositoryStudioIntent): Promise<{
    operationId: string; state: string; alreadyExists: boolean;
  }>;
  advance(operationId: string, expected: string, next: string, repositoryId?: number | null): Promise<string>;
  finishWithAccess(operationId: string, created: { repositoryId: number }): Promise<true>;
};
