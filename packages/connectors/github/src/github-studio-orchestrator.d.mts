export declare function coordinateRepositoryCreation(args: {
  intent: unknown;
  store: {
    reserve(intent: unknown): Promise<{ operationId: string; state: string; alreadyExists: boolean }>;
    advance(id: string, expected: string, next: string, repositoryId?: number | null): Promise<string>;
  };
  create(): Promise<{ repositoryId: number; fullName: string; url: string }>;
  verifyAccess(created: { repositoryId: number; fullName: string; url: string }): Promise<boolean>;
  finishWithAccess(id: string, created: { repositoryId: number }): Promise<boolean>;
}): Promise<
  | { operationId: string; state: string; dispatched: boolean }
  | { operationId: string; state: "succeeded"; dispatched: true;
      repository: { id: number; name: string; url: string } }
>;
