export const LINEAR_STATE_COOKIE: string;
export const LINEAR_PKCE_COOKIE: string;
export const LINEAR_CALLBACK_PATH: string;
export interface LinearRouteCookie {
  name: string; value: string; httpOnly: true; secure: true; sameSite: "lax";
  path: string; maxAge: number;
}
export type LinearRouteResult =
  | { kind: "json"; status: number; error: string; headers: Record<string, string>; cookies: [] }
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
  settings: { publicOrigin: string; stateKey: string } | null;
  resolveActorForState: (stateHash: string, now: string) => Promise<{ workspaceId: string; userId: string } | null>;
  consumeState: (args: {
    state: string; cookieState: string; workspaceId: string; userId: string; stateKey: string; now: number;
  }) => Promise<unknown>;
  now?: number;
}): Promise<LinearRouteResult>;
