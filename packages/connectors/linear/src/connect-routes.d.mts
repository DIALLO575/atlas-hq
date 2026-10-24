Warning: truncated output (original token count: 1279)
Total output lines: 72

export const LINEAR_STATE_COOKIE: string;
export const LINEAR_PKCE_COOKIE: string;
export const LINEAR_CALLBACK_PATH: string;
export interface LinearRouteCookie {
  name: string; value: string; httpOnly: true; secure: true; sameSite: "lax";
  path: string; maxAge: number;
}
export type LinearRouteResult =
  | { kind: "json"; status: number; error?: string; result?: string; providerRevocation?: "confirmed" | "unconfirmed"; headers: Record<string, string>; cookies: [] }
  | { kind: "redirect"; status: 303; location: string; headers: Record<string, string>; cookies: LinearRouteCookie[] };
export function verifyLinearWorkspaceAdmin(client: unknown, workspaceId: string): Promise<{
  workspaceId: string; userId: string;
} | null>;
export function verifyLinearStateActor(args: {
  client: unknown; admin: unknown; stateHash: string;
}): Promise<{ workspaceId: string; userId: string } | null>;
export function startLinearOAuthRoute(request: Request, dependencies: {
  settings: { publicOrigin: string; redirectUri: string; clientId: string; stateKey: string } | null;
  authorizeWorkspaceAdmin: (workspaceId: string) => Promise<{ workspaceId: string; userId: string } | null>;
  registerState: (args: { workspaceId: string; userId: string; stateKey: string; now: number }) => Promise<string>;
  now?: number;
}): Promise<LinearRouteResult>;
export function callbackLinearOAuthRoute(request: Request, dependencies: {
  settings: { publicOrigin: string; stateKey: string; clientId: string; redirectUri: string } | null;
  callbackEnabled?: boolean;
  clientSecret?: string;
  prepareConnectionStore?: (actor: { workspaceId: string; userId: string }) => Promise<void>;
  revokeTokens?: (tokens: { accessToken: string; refreshToken: string }) => Promise<unknown>;
  exchangeCode?: (args: {
    code: string; clientId: string; clientSecret?: string; redirectUri: string; codeVerifier: string;
  }) => Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number; scopes: string[] }>;
 …279 tokens truncated…tring; refreshToken: string; linearWorkspaceId: string; linearActorId: string;
    scopes: string[]; accessExpiresAt: string; version: number; revokedAt: string | null;
    refreshAttemptId: string | null; refreshStartedAt: string | null;
  }>;
  claimRefresh: (args: { actor: { workspaceId: string; userId: string }; version: number; attemptId: string }) => Promise<boolean>;
  requestRefresh: (refreshToken: string) => Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number; scopes: string[] }>;
  completeRefresh: (args: { actor: { workspaceId: string; userId: string }; version: number; attemptId: string;
    connection: { linearWorkspaceId: string; linearActorId: string };
    tokens: { accessToken: string; refreshToken: string; expiresInSeconds: number; scopes: string[] };
    scopes: string[]; expiresAt: string }) => Promise<false | { version: number }>;
  rejectRefresh: (args: { actor: { workspaceId: string; userId: string }; version: number; attemptId: string }) => Promise<boolean>;
  invalidateUncertainRefresh: (args: { actor: { workspaceId: string; userId: string }; version: number; attemptId: string }) => Promise<boolean>;
  revokeTokens: (tokens: { accessToken: string; refreshToken: string }) => Promise<unknown>;
  now?: number;
}): Promise<LinearRouteResult>;
export function disconnectLinearConnectionRoute(request: Request, dependencies: {
  settings: { publicOrigin: string; clientId: string } | null;
  authorizeWorkspaceAdmin: (workspaceId: string) => Promise<{ workspaceId: string; userId: string } | null>;
  loadConnection: (actor: { workspaceId: string; userId: string }) => Promise<null | {
    accessToken: string; refreshToken: string; version: number; revokedAt: string | null;
  }>;
  revokeLocal: (args: { actor: { workspaceId: string; userId: string }; version: number }) => Promise<boolean>;
  revokeTokens: (tokens: { accessToken: string; refreshToken: string }) => Promise<{ allRevoked: boolean }>;
}): Promise<LinearRouteResult>;
