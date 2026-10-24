import { randomUUID } from "node:crypto";
import { refreshNotionOAuthToken, NotionRefreshError } from "./refresh-token.mjs";

/**
 * Caller MUST have already authorized the exact ATLAS actor and verified the
 * linked registry. Store implements service-role-only PostgreSQL CAS RPCs.
 * Never auto retry an unknown token rotation outcome.
 */
export async function rotateNotionCredentials({
  record, tokens, actor, vault, clientId, clientSecret, store,
  request = fetch, attemptId = randomUUID(),
}) {
  if (!record || !actor || !vault || !store || !tokens?.refreshToken ||
      !Number.isSafeInteger(record.version) || record.version < 1 ||
      record.revoked_at !== null || record.refresh_attempt_id != null ||
      typeof store.claim !== "function" || typeof store.complete !== "function" ||
      typeof store.fail !== "function") {
    throw new NotionRefreshError("REAUTH_REQUIRED");
  }
  const key = {
    connectionId: record.connection_id,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    expectedVersion: record.version, attemptId,
  };
  let claimed = false;
  try { claimed = (await store.claim(key)) === true; }
  catch { throw new NotionRefreshError("REFRESH_UNAVAILABLE"); }
  if (!claimed) throw new NotionRefreshError("REFRESH_BUSY");
  try {
    const fresh = await refreshNotionOAuthToken({
      clientId, clientSecret, refreshToken: tokens.refreshToken,
      notionWorkspaceId: record.notion_workspace_id,
      notionBotId: record.notion_bot_id, request,
    });
    const encrypted = vault.encryptTokens(fresh, {
      atlasWorkspaceId: actor.workspaceId, actorUserId: actor.userId,
      notionWorkspaceId: record.notion_workspace_id,
      notionBotId: record.notion_bot_id,
    });
    const version = await store.complete({ ...key, encrypted });
    if (version !== record.version + 1) {
      throw new NotionRefreshError("COMMIT_UNCONFIRMED");
    }
    return { accessToken: fresh.accessToken, version };
  } catch {
    // If the provider did rotate credentials but we lost the response or
    // storage failed, tombstone this *exact attempt*; never reuse old refresh.
    try { await store.fail(key); } catch {}
    throw new NotionRefreshError("REAUTH_REQUIRED");
  }
}
