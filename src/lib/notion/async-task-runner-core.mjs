import { createNotionReadClient, NotionReadError } from "../../../packages/connectors/notion/src/rest-client.mjs";
import { processOneNotionAsyncTask } from "../../../packages/connectors/notion/src/async-task-worker.mjs";
import { notionRestBudgetForPersonalConnection } from "../../../packages/connectors/notion/src/reliability.mjs";
import { createNotionDistributedBudget } from "../../../packages/connectors/notion/src/distributed-budget.mjs";

const METRICS = new Set(["idle", "invalid_lease", "lease_lost", "store_unavailable",
  "succeeded", "dead", "rescheduled"]);

/**
 * Internal dependency-injected implementation for the server-only entrypoint.
 * It stays in a separate module so Node tests can falsify the RPC/GET path with
 * an in-memory admin client and fetch without loading Next's server-only guard.
 */
export async function runNotionAsyncTaskWorker({
  admin: rawAdmin, vault, onMetric = () => {}, fetchImpl = fetch,
}) {
  if (!rawAdmin || !vault || typeof vault.decryptTokens !== "function" ||
      typeof onMetric !== "function" || typeof fetchImpl !== "function") {
    throw new Error("NOTION_WORKER_NOT_CONFIGURED");
  }
  const admin = rawAdmin;
  const store = {
    async claim() {
      const { data, error } = await admin.rpc("atlas_notion_claim_async_task", {
        p_lease_seconds: 90,
      });
      if (error) throw new Error("NOTION_ASYNC_STORE_UNAVAILABLE");
      if (data == null) return null;
      if (!Array.isArray(data) || data.length > 1) throw new Error("NOTION_ASYNC_STORE_UNAVAILABLE");
      return data[0] ?? null;
    },
    async finish(value) {
      const { data, error } = await admin.rpc("atlas_notion_finish_async_task", {
        p_job_id: value.jobId, p_lease_id: value.leaseId,
        p_outcome: value.outcome, p_delay_seconds: value.delaySeconds,
        p_error_code: value.errorCode,
      });
      if (error) throw new Error("NOTION_ASYNC_STORE_UNAVAILABLE");
      return data === true;
    },
  };

  return processOneNotionAsyncTask({
    store,
    onMetric(name) {
      if (METRICS.has(name)) {
        try { onMetric(name); } catch { /* telemetry never changes job state */ }
      }
    },
    async readTask(claim, { signal }) {
      // Revalidate the complete actor/workspace/connection/credential binding
      // before decrypting. Missing rows, refresh, and revoked records stop here.
      const { data: connection, error: connectionError } = await admin
        .from("atlas_notion_connections").select("*")
        .eq("connection_id", claim.connection_id).eq("workspace_id", claim.workspace_id)
        .eq("user_id", claim.user_id).eq("notion_workspace_id", claim.notion_workspace_id)
        .eq("version", claim.credential_version).is("revoked_at", null).maybeSingle();
      if (connectionError) {
        throw Object.assign(new Error("NOTION_STORE_UNAVAILABLE"), { code: "STORE_UNAVAILABLE" });
      }
      if (!connection || connection.refresh_attempt_id !== null) {
        throw Object.assign(new Error("NOTION_BINDING_UNAVAILABLE"), { code: "PERMISSION_DENIED" });
      }
      const [{ data: registry, error: registryError }, { data: member, error: memberError }] =
        await Promise.all([
          admin.from("atlas_connections").select("id,owner_id,workspace_id,provider,status")
            .eq("id", claim.connection_id).eq("workspace_id", claim.workspace_id)
            .eq("owner_id", claim.user_id).eq("provider", "notion").eq("status", "connected")
            .maybeSingle(),
          admin.from("workspace_members").select("role")
            .eq("workspace_id", claim.workspace_id).eq("user_id", claim.user_id).maybeSingle(),
        ]);
      if (registryError || memberError) {
        throw Object.assign(new Error("NOTION_STORE_UNAVAILABLE"), { code: "STORE_UNAVAILABLE" });
      }
      if (!registry || !member || !["owner", "admin"].includes(member.role)) {
        throw Object.assign(new Error("NOTION_BINDING_UNAVAILABLE"), { code: "PERMISSION_DENIED" });
      }
      let tokens;
      try {
        tokens = vault.decryptTokens(connection, {
          atlasWorkspaceId: claim.workspace_id, actorUserId: claim.user_id,
          notionWorkspaceId: claim.notion_workspace_id, notionBotId: connection.notion_bot_id,
        });
      } catch {
        throw Object.assign(new Error("NOTION_CREDENTIAL_UNAVAILABLE"), { code: "AUTH_REQUIRED" });
      }
      const binding = {
        workspaceId: claim.workspace_id, userId: claim.user_id,
        connectionId: claim.connection_id, notionWorkspaceId: claim.notion_workspace_id,
        version: claim.credential_version,
      };
      const localBudget = notionRestBudgetForPersonalConnection({
        workspaceId: claim.notion_workspace_id, connectionId: claim.connection_id,
      });
      const requestBudget = createNotionDistributedBudget({
        binding, localBudget,
        store: {
          async reserve(key) {
            const { data, error } = await admin.rpc("atlas_notion_reserve_rest_read", {
              p_connection_id: key.connectionId, p_workspace_id: key.workspaceId,
              p_user_id: key.userId, p_notion_workspace_id: key.notionWorkspaceId,
              p_expected_version: key.version, p_max_wait_ms: key.maxWaitMs,
            });
            if (error || !data || typeof data !== "object") throw new Error("BUDGET_STORE_UNAVAILABLE");
            const row = data;
            return Number.isInteger(row.delay_ms) &&
              (row.probe_lease_id === null || typeof row.probe_lease_id === "string")
              ? { delayMs: row.delay_ms, probeLeaseId: row.probe_lease_id }
              : null;
          },
          async cooldown(key) {
            const { data, error } = await admin.rpc("atlas_notion_cooldown_rest_read", {
              p_connection_id: key.connectionId, p_workspace_id: key.workspaceId,
              p_user_id: key.userId, p_notion_workspace_id: key.notionWorkspaceId,
              p_expected_version: key.version, p_retry_after_seconds: key.seconds,
            });
            if (error) throw new Error("BUDGET_STORE_UNAVAILABLE");
            return data === true;
          },
          async reportOutcome(key) {
            const { data, error } = await admin.rpc("atlas_notion_report_rest_outcome", {
              p_connection_id: key.connectionId, p_workspace_id: key.workspaceId,
              p_user_id: key.userId, p_notion_workspace_id: key.notionWorkspaceId,
              p_expected_version: key.version, p_outcome: key.outcome,
              p_probe_lease_id: key.probeLeaseId,
            });
            if (error) throw new Error("BUDGET_STORE_UNAVAILABLE");
            return data === true;
          },
        },
      });
      const client = createNotionReadClient({ token: tokens.accessToken,
        timeoutMs: 7000, requestBudget, retryOptions: { maxRetries: 0 },
        async request(input, init) {
          const fixedUrl = "https://api.notion.com/v1/async_tasks/" + claim.provider_task_id;
          if (input !== fixedUrl || init?.method !== "GET") {
            throw new NotionReadError("INVALID_INPUT", 400);
          }
          // This runs after distributed admission, immediately before fetch.
          const { data: lease, error: leaseError } = await admin
            .from("atlas_notion_async_jobs").select("id")
            .eq("id", claim.job_id).eq("lease_id", claim.lease_id)
            .eq("status", "leased").gt("lease_until", new Date().toISOString())
            .maybeSingle();
          if (leaseError) throw new NotionReadError("STORE_UNAVAILABLE");
          if (!lease) throw new NotionReadError("REQUEST_TIMEOUT_OR_ABORTED");
          return fetchImpl(input, init);
        },
      });
      return client.getAsyncTask(claim.provider_task_id, { signal });
    },
  });
}
