export function createNotionOAuthState(args: {
  workspaceId: string; userId: string; key: string; now?: number;
  store: { insertPendingState(row: { stateHash: string; workspaceId: string;
    userId: string; expiresAt: string }): Promise<void> };
}): Promise<string>;
export function readNotionOAuthState(args: {
  state: string | null | undefined; cookieState: string | null | undefined;
  key: string; now?: number;
}): { stateHash: string } | null;
export function consumeNotionOAuthState(args: {
  workspaceId: string; userId: string; key: string; state: string;
  cookieState: string; now?: number;
  store: { consumePendingState(row: { stateHash: string; workspaceId: string;
    userId: string; now: string }): Promise<boolean> };
}): Promise<{ workspaceId: string; userId: string } | null>;
