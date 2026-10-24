const WORKSPACE_ROLES = new Set(["owner", "admin", "member"]);

/** Workspace identities come from the verified ATLAS session and membership query. */
export function authorizeLinearWorkspaceAccess({
  actorUserId,
  memberUserId,
  memberRole,
  requestedWorkspaceId,
  linkedWorkspaceId,
}) {
  if (typeof actorUserId !== "string" || !actorUserId || actorUserId !== memberUserId) return false;
  if (!WORKSPACE_ROLES.has(memberRole)) return false;
  if (typeof requestedWorkspaceId !== "string" || !requestedWorkspaceId) return false;
  return requestedWorkspaceId === linkedWorkspaceId;
}

export function canManageLinearConnection(role) {
  return role === "owner" || role === "admin";
}
