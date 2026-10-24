import "server-only";
import { createNotionReadClient } from "../../../packages/connectors/notion/src/rest-client.mjs";
import { notionRestBudgetForPersonalConnection }
  from "../../../packages/connectors/notion/src/reliability.mjs";
import { createNotionDistributedBudget }
  from "../../../packages/connectors/notion/src/distributed-budget.mjs";
import { rotateNotionCredentials } from "../../../packages/connectors/notion/src/refresh-flow.mjs";
import { assertPersonalNotionConnection } from "../../../packages/connectors/notion/src/resource-view.mjs";
import { adminNotionClient, notionConnectSettings, notionTokenVault,
  requireNotionWorkspaceActor } from "./connect";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class NotionConnectionAccessError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export async function loadNotionPersonalConnection({
  workspaceId, connectionId,
}: { workspaceId: string; connectionId: string }) {
  if (!UUID.test(workspaceId) || !UUID.test(connectionId)) {
    throw new NotionConnectionAccessError("INVALID_REQUEST");
  }
  const actor = await requireNotionWorkspaceActor(workspaceId);
  if (!actor) throw new NotionConnectionAccessError("FORBIDDEN");
  const settings = notionConnectSettings();
  const vault = notionTokenVault();
  if (!settings || !settings.callbackEnabled || !vault) {
    throw new NotionConnectionAccessError("NOT_CONFIGURED");
  }
  const admin = adminNotionClient(settings);
  const { data: connection, error: credentialError } = await admin.from("atlas_notion_connections")
    .select("*").eq("connection_id", connectionId).eq("workspace_id", actor.workspaceId)
    .eq("user_id", actor.userId).is("revoked_at", null).maybeSingle();
  if (credentialError) throw new NotionConnectionAccessError("STORE_UNAVAILABLE");
  if (!connection) throw new NotionConnectionAccessError("NOT_FOUND");
  if (connection.refresh_attempt_id !== null) {
    throw new NotionConnectionAccessError("REFRESH_IN_PROGRESS");
  }
  const { data: registry, error: registryError } = await admin.from("atlas_connections")
    .select("id,owner_id,workspace_id,provider,status")
    .eq("id", connectionId).eq("workspace_id", actor.workspaceId)
    .eq("owner_id", actor.userId).eq("provider", "notion").maybeSingle();
  if (registryError) throw new NotionConnectionAccessError("STORE_UNAVAILABLE");
  try { assertPersonalNotionConnection({ connection, registry, actor, connectionId }); }
  catch { throw new NotionConnectionAccessError("NOT_FOUND"); }
  const tokens = vault.decryptTokens(connection, {
    atlasWorkspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    notionWorkspaceId: connection.notion_workspace_id,
    notionBotId: connection.notion_bot_id,
  });
  const budgetForVersion = (version: number) => {
    const localBudget = notionRestBudgetForPersonalConnection({
      workspaceId: connection.notion_workspace_id,
      connectionId: connection.connection_id,
    });
    // Explicit opt-in AFTER official Supabase schema migration and live
    // sandbox verification. If enabled but RPC is absent, fail closed.
    if (process.env.NOTION_DISTRIBUTED_BUDGET_ENABLED !== "true") {
      return localBudget;
    }
    return createNotionDistributedBudget({
      binding: {
        workspaceId: actor.workspaceId, userId: actor.userId,
        notionWorkspaceId: connection.notion_workspace_id,
        connectionId: connection.connection_id, version,
      },
      localBudget,
      store: {
        async reserve(key) {
          const { data, error } = await admin.rpc("atlas_notion_reserve_rest_read", {
            p_connection_id: key.connectionId,
            p_workspace_id: key.workspaceId, p_user_id: key.userId,
            p_notion_workspace_id: key.notionWorkspaceId,
            p_expected_version: key.version, p_max_wait_ms: key.maxWaitMs,
          });
          if (error) throw new Error("NOTION_BUDGET_STORE_UNAVAILABLE");
          return typeof data === "number" && Number.isInteger(data) ? data : null;
        },
        async cooldown(key) {
          const { data, error } = await admin.rpc("atlas_notion_cooldown_rest_read", {
            p_connection_id: key.connectionId,
            p_workspace_id: key.workspaceId, p_user_id: key.userId,
            p_notion_workspace_id: key.notionWorkspaceId,
            p_expected_version: key.version,
            p_retry_after_seconds: key.seconds,
          });
          if (error) throw new Error("NOTION_BUDGET_STORE_UNAVAILABLE");
          return data === true;
        },
        async reportOutcome(key) {
          const { data, error } = await admin.rpc("atlas_notion_report_rest_outcome", {
            p_connection_id: key.connectionId,
            p_workspace_id: key.workspaceId, p_user_id: key.userId,
            p_notion_workspace_id: key.notionWorkspaceId,
            p_expected_version: key.version, p_outcome: key.outcome,
          });
          if (error) throw new Error("NOTION_BUDGET_STORE_UNAVAILABLE");
          return data === true;
        },
      },
    });
  };
  const requestBudget = budgetForVersion(connection.version);
  return {
    actor, settings, admin, vault, record: connection, tokens, requestBudget, budgetForVersion,
    client: createNotionReadClient({
      token: tokens.accessToken, requestBudget,
    }),
  };
}

/** Refresh only after a verified Notion 401, never on speculative timers. */
export async function refreshNotionPersonalConnection(
  loaded: Awaited<ReturnType<typeof loadNotionPersonalConnection>>,
) {
  const { admin, actor, record, tokens, vault, settings } = loaded;
  return rotateNotionCredentials({
    record, actor, tokens, vault,
    clientId: settings.clientId, clientSecret: settings.clientSecret,
    store: {
      async claim(value) {
        const { data, error } = await admin.rpc("atlas_notion_claim_refresh", {
          p_connection_id: value.connectionId,
          p_workspace_id: value.workspaceId, p_user_id: value.userId,
          p_expected_version: value.expectedVersion, p_attempt_id: value.attemptId,
        });
        if (error) throw new Error("NOTION_REFRESH_STORE_UNAVAILABLE");
        return data === true;
      },
      async complete(value) {
        const { data, error } = await admin.rpc("atlas_notion_complete_refresh", {
          p_connection_id: value.connectionId,
          p_workspace_id: value.workspaceId, p_user_id: value.userId,
          p_expected_version: value.expectedVersion, p_attempt_id: value.attemptId,
          p_token_key_id: value.encrypted.token_key_id,
          p_access_nonce: value.encrypted.access_nonce,
          p_access_ciphertext: value.encrypted.access_ciphertext,
          p_access_tag: value.encrypted.access_tag,
          p_refresh_nonce: value.encrypted.refresh_nonce,
          p_refresh_ciphertext: value.encrypted.refresh_ciphertext,
          p_refresh_tag: value.encrypted.refresh_tag,
        });
        if (error) throw new Error("NOTION_REFRESH_STORE_UNAVAILABLE");
        return typeof data === "number" ? data : null;
      },
      async fail(value) {
        const { data, error } = await admin.rpc("atlas_notion_fail_refresh", {
          p_connection_id: value.connectionId,
          p_workspace_id: value.workspaceId, p_user_id: value.userId,
          p_expected_version: value.expectedVersion, p_attempt_id: value.attemptId,
        });
        if (error) throw new Error("NOTION_REFRESH_STORE_UNAVAILABLE");
        return data === true;
      },
    },
  });
}
