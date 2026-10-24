import { canManageLinearConnection } from "./workspace-access.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bindingOf(record) {
  return {
    atlasWorkspaceId: record.workspace_id,
    actorUserId: record.user_id,
    linearWorkspaceId: record.linear_workspace_id,
    linearActorId: record.linear_actor_id,
  };
}

/** Server-only save. Expected-version compare-and-swap is enforced by the SQL RPC. */
export async function saveLinearConnection(admin, { actor, linearIdentity, tokens, scopes, expiresAt, vault, expectedVersion }) {
  const ids = [actor?.workspaceId, actor?.userId, linearIdentity?.workspaceId, linearIdentity?.userId];
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== "read" ||
      !Number.isFinite(Date.parse(expiresAt)) || !vault ||
      (expectedVersion !== undefined && expectedVersion !== null && !Number.isSafeInteger(expectedVersion))) {
    throw new Error("LINEAR_CONNECTION_INVALID");
  }

  const binding = {
    atlasWorkspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    linearWorkspaceId: linearIdentity.workspaceId,
    linearActorId: linearIdentity.userId,
  };
  const encrypted = vault.encryptTokens(tokens, binding);
  let version = expectedVersion;
  if (version === undefined) {
    const { data: existing, error: lookupError } = await admin.from("atlas_linear_connections")
      .select("version").eq("workspace_id", actor.workspaceId).eq("user_id", actor.userId).maybeSingle();
    if (lookupError) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
    version = existing?.version ?? null;
  }

  const { data, error } = await admin.rpc("atlas_linear_save_connection", {
    p_workspace_id: actor.workspaceId,
    p_user_id: actor.userId,
    p_linear_workspace_id: linearIdentity.workspaceId,
    p_linear_actor_id: linearIdentity.userId,
    p_token_key_id: encrypted.token_key_id,
    p_access_nonce: encrypted.access_nonce,
    p_access_ciphertext: encrypted.access_ciphertext,
    p_access_tag: encrypted.access_tag,
    p_refresh_nonce: encrypted.refresh_nonce,
    p_refresh_ciphertext: encrypted.refresh_ciphertext,
    p_refresh_tag: encrypted.refresh_tag,
    p_scopes: scopes,
    p_access_expires_at: expiresAt,
    p_expected_version: version,
  });
  if (error || !Number.isSafeInteger(data)) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
  return { version: data };
}

/** The user identity and role are derived from a verified session and live membership. */
export async function loadLinearConnectionForActor({
  session, admin, workspaceId, vault, allowExpired = false, includeRevoked = false, allowMemberRead = false,
}) {
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) return null;
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;
  const { data: membership, error: membershipError } = await session.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership ||
      (!canManageLinearConnection(membership.role) && !(allowMemberRead && membership.role === "member"))) return null;
  let query = admin.from("atlas_linear_connections")
    .select("workspace_id,user_id,linear_workspace_id,linear_actor_id,token_key_id,access_nonce,access_ciphertext,access_tag,refresh_nonce,refresh_ciphertext,refresh_tag,scopes,access_expires_at,version,revoked_at,refresh_attempt_id,refresh_started_at")
    .eq("workspace_id", workspaceId).eq("user_id", user.id);
  if (!includeRevoked) query = query.is("revoked_at", null);
  if (!allowExpired) query = query.gt("access_expires_at", new Date().toISOString());
  const { data: row, error } = await query.maybeSingle();
  if (error || !row || !vault) return null;
  return {
    ...vault.decryptTokens(row, bindingOf(row)),
    actorUserId: user.id,
    linearWorkspaceId: row.linear_workspace_id,
    linearActorId: row.linear_actor_id,
    scopes: row.scopes,
    accessExpiresAt: row.access_expires_at,
    version: row.version,
    revokedAt: row.revoked_at,
    refreshAttemptId: row.refresh_attempt_id,
    refreshStartedAt: row.refresh_started_at,
  };
}

export async function claimLinearConnectionRefresh(admin, { workspaceId, userId, expectedVersion, attemptId }) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !UUID.test(attemptId) || !Number.isSafeInteger(expectedVersion)) return false;
  const { data, error } = await admin.rpc("atlas_linear_claim_refresh", {
    p_workspace_id: workspaceId, p_user_id: userId,
    p_expected_version: expectedVersion, p_attempt_id: attemptId,
  });
  return !error && data === true;
}

export async function completeLinearConnectionRefresh(admin, {
  workspaceId, userId, expectedVersion, attemptId, connection, tokens, scopes, expiresAt, vault,
}) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !UUID.test(attemptId) ||
      !Number.isSafeInteger(expectedVersion) || !connection || !vault ||
      !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== "read" ||
      !Number.isFinite(Date.parse(expiresAt))) return false;
  const encrypted = vault.encryptTokens(tokens, bindingOf({
    workspace_id: workspaceId, user_id: userId,
    linear_workspace_id: connection.linearWorkspaceId, linear_actor_id: connection.linearActorId,
  }));
  const { data, error } = await admin.rpc("atlas_linear_complete_refresh", {
    p_workspace_id: workspaceId, p_user_id: userId,
    p_expected_version: expectedVersion, p_attempt_id: attemptId,
    p_token_key_id: encrypted.token_key_id,
    p_access_nonce: encrypted.access_nonce, p_access_ciphertext: encrypted.access_ciphertext, p_access_tag: encrypted.access_tag,
    p_refresh_nonce: encrypted.refresh_nonce, p_refresh_ciphertext: encrypted.refresh_ciphertext, p_refresh_tag: encrypted.refresh_tag,
    p_scopes: scopes, p_access_expires_at: expiresAt,
  });
  return !error && Number.isSafeInteger(data) ? { version: data } : false;
}

export async function rejectLinearConnectionRefresh(admin, { workspaceId, userId, expectedVersion, attemptId }) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !UUID.test(attemptId) || !Number.isSafeInteger(expectedVersion)) return false;
  const { data, error } = await admin.rpc("atlas_linear_reject_refresh", {
    p_workspace_id: workspaceId, p_user_id: userId,
    p_expected_version: expectedVersion, p_attempt_id: attemptId,
  });
  return !error && data === true;
}

export async function invalidateUncertainLinearRefresh(admin, { workspaceId, userId, expectedVersion, attemptId }) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !UUID.test(attemptId) || !Number.isSafeInteger(expectedVersion)) return false;
  const { data, error } = await admin.rpc("atlas_linear_uncertain_refresh", {
    p_workspace_id: workspaceId, p_user_id: userId,
    p_expected_version: expectedVersion, p_attempt_id: attemptId,
  });
  return !error && data === true;
}

/** Logical revocation preserves auditability and uses a version-checked database function. */
export async function revokeLinearConnection(admin, { workspaceId, userId, expectedVersion }) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !Number.isSafeInteger(expectedVersion)) return false;
  const { data, error } = await admin.rpc("atlas_linear_revoke_connection", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_expected_version: expectedVersion,
  });
  return !error && data === true;
}


/** Re-encrypts one actor's record with the current key and a version-pinned CAS. */
export async function rotateLinearConnectionKey(admin, { workspaceId, userId, vault }) {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !vault) return { rotated: false, reason: "invalid" };
  const columns = "workspace_id,user_id,linear_workspace_id,linear_actor_id,token_key_id,access_nonce,access_ciphertext,access_tag,refresh_nonce,refresh_ciphertext,refresh_tag,scopes,access_expires_at,version,revoked_at";
  const { data: row, error } = await admin.from("atlas_linear_connections")
    .select(columns).eq("workspace_id", workspaceId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (error) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
  if (!row) return { rotated: false, reason: "not-found" };
  if (row.token_key_id === vault.currentKeyId) return { rotated: false, reason: "current-key" };
  const tokens = vault.decryptTokens(row, bindingOf(row));
  const result = await saveLinearConnection(admin, {
    actor: { workspaceId, userId },
    linearIdentity: { workspaceId: row.linear_workspace_id, userId: row.linear_actor_id },
    tokens, scopes: row.scopes, expiresAt: row.access_expires_at, vault, expectedVersion: row.version,
  });
  return { rotated: true, version: result.version };
}
