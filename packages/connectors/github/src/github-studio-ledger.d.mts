export declare function createRepositoryIntent(args: {
  draft: { workspaceId: string; installationId: number; name: string;
    description?: string; private?: boolean; autoInit?: boolean };
  actorId: string; idempotencyKey: string;
}): Readonly<{
  workspaceId: string; installationId: number; actorId: string;
  idempotencyKey: string; action: "repository.create"; digest: string;
}>;
