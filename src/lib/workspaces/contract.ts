export type Workspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};

export type WorkspaceResult =
  | { status: "ready"; workspaces: Workspace[]; selectedId: string }
  | { status: "error"; message: string };

/** Client actions accept only a workspace selection; identity always comes from verified server auth. */
