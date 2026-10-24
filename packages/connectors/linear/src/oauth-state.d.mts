export interface LinearOAuthStateStore {
  insertPendingState(record: {
    stateHash: string; workspaceId: string; userId: string; expiresAt: string;
  }): Promise<void>;
  consumePendingState(record: {
    stateHash: string; workspaceId: string; userId: string; now: string;
  }): Promise<boolean>;
}
export function createLinearOAuthState(args: {
  workspaceId: string; userId: string; key: string; store: LinearOAuthStateStore; now?: number;
}): Promise<string>;
export function readLinearOAuthState(args: {
  state: string; cookieState: string; key: string; now?: number;
}): { stateHash: string } | null;
export function consumeLinearOAuthState(args: {
  state: string; cookieState: string; workspaceId: string; userId: string;
  key: string; store: LinearOAuthStateStore; now?: number;
}): Promise<{ workspaceId: string; userId: string } | null>;
