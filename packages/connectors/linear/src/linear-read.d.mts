export const LINEAR_READ_PAGE_SIZE: 25;
export function readLinearResourceRoute(request: Request, dependencies: {
  publicOrigin?: string;
  authorizeWorkspaceMember: (workspaceId: string) => Promise<{ workspaceId: string; userId: string } | null>;
  loadConnection: (actor: { workspaceId: string; userId: string }) => Promise<null | {
    accessToken: string; actorUserId: string; linearWorkspaceId: string; linearActorId: string;
    scopes: string[]; accessExpiresAt: string; revokedAt: string | null;
  }>;
  refreshConnection: (actor: { workspaceId: string; userId: string }) => Promise<{ status: number; result?: string } | null>;
  queryLinear?: (args: { accessToken: string; query: string; operationName: string; variables: { first: number; after: string | null } }) => Promise<unknown>;
  now?: number;
}): Promise<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>;
