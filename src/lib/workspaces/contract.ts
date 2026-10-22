export type Workspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
};

export type WorkspaceResult =
  | { status: "ready"; workspaces: Workspace[]; selectedId: string }
  | { status: "unavailable"; reason: "backend-contract-missing" }
  | { status: "error"; message: string };

/** The server contract must provide membership-filtered workspaces for the current auth.uid(). */
export interface WorkspaceAdapter {
  listForCurrentUser(): Promise<WorkspaceResult>;
  selectForCurrentUser(workspaceId: string): Promise<WorkspaceResult>;
}

/** No workspace or membership table exists in the verified Supabase schema yet. */
export const workspaceAdapter: WorkspaceAdapter = {
  async listForCurrentUser() {
    return { status: "unavailable", reason: "backend-contract-missing" };
  },
  async selectForCurrentUser() {
    return { status: "unavailable", reason: "backend-contract-missing" };
  },
};
