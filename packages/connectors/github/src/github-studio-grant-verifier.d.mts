export declare function verifyCreatedRepositoryAccess(args: {
  workspaceId: string; installationId: number; binding: unknown;
  created: { repositoryId: number; fullName: string; url: string };
  appId: string; privateKey: string;
  request?: typeof fetch; now?: () => number;
}): Promise<boolean>;
