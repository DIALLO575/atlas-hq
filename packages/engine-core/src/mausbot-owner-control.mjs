/**
 * Owner-initiated OpenMausBot operations are different from autonomous agent
 * dispatch. This predicate alone cannot authorize a mutation: the BFF must
 * authenticate the user, reserve an action in durable PostgreSQL, and then
 * execute exactly one validated native primitive.
 *
 * Never accept workspace, scope, URL or bearer credentials from the browser
 * as authorization. Only an explicitly reviewed production release is eligible.
 */
export function mausbotOwnerControlPermission(env, { role, workspaceId, mode } = {}) {
  if (mode !== "write" && mode !== "execute") {
    return { allowed: false, code: "MAUSBOT_CONTROL_MODE_INVALID", status: 400 };
  }
  if (role !== "owner" || !workspaceId || env.ATLAS_MAUSBOT_WORKSPACE_ID !== workspaceId) {
    return { allowed: false, code: "MAUSBOT_OWNER_REQUIRED", status: 403 };
  }
  if (env.ATLAS_MAUSBOT_RELEASE_STAGE !== "admin" ||
      env.ATLAS_MAUSBOT_ADMIN_CONTROL_ENABLED !== "true" ||
      env.ATLAS_MAUSBOT_ADMIN_IDENTITY_VERIFIED !== "true" ||
      !env.ATLAS_MAUSBOT_INSTANCE_ID ||
      !env.ATLAS_MAUSBOT_TOKEN_VERSION) {
    return { allowed: false, code: "MAUSBOT_ADMIN_CONTROL_NOT_RELEASED", status: 423 };
  }
  return { allowed: true, status: 200 };
}
