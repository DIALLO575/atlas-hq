import { GitHubStudioError } from "./github-studio-create.mjs";

const uuid = (x) => typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const states = new Set(["prepared", "dispatching", "provider_confirmed",
  "reconciliation_required", "succeeded", "failed"]);

/** Server-only persistence adapter. RPC must be a trusted service-role caller.
 * The current Next.js preview route does NOT call this adapter.
 */
export function createGitHubStudioOperationStore({ rpc }) {
  if (typeof rpc !== "function") throw new GitHubStudioError("STORAGE_UNAVAILABLE");

  async function call(method, payload) {
    let result;
    try { result = await rpc(method, payload); }
    catch { throw new GitHubStudioError("STORAGE_UNAVAILABLE"); }
    if (!result || result.error) throw new GitHubStudioError("STORAGE_UNAVAILABLE");
    return result.data;
  }

  return Object.freeze({
    async reserve(intent) {
      if (!intent || !uuid(intent.workspaceId) || !uuid(intent.actorId) ||
          !uuid(intent.idempotencyKey) || !positive(intent.installationId) ||
          intent.action !== "repository.create" ||
          !/^[0-9a-f]{64}$/.test(intent.digest ?? "") ||
          !intent.draft || typeof intent.draft.name !== "string") {
        throw new GitHubStudioError("INVALID_INPUT");
      }
      const data = await call("atlas_gh_studio_reserve", {
        p_workspace_id: intent.workspaceId,
        p_actor_id: intent.actorId,
        p_installation_id: intent.installationId,
        p_idempotency_key: intent.idempotencyKey,
        p_repository_name: intent.draft.name,
        p_visibility: intent.draft.private ? "private" : "public",
        p_digest: intent.digest,
      });
      const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
      if (!uuid(row?.operation_id) || !states.has(row?.operation_state) ||
          typeof row?.already_exists !== "boolean") {
        throw new GitHubStudioError("STORAGE_UNAVAILABLE");
      }
      return Object.freeze({ operationId: row.operation_id,
        state: row.operation_state, alreadyExists: row.already_exists });
    },

    async advance(id, expected, next, repositoryId = null) {
      if (!uuid(id) || !states.has(expected) || !states.has(next) ||
          (repositoryId !== null && !positive(repositoryId))) {
        throw new GitHubStudioError("INVALID_INPUT");
      }
      const data = await call("atlas_gh_studio_advance", {
        p_operation_id: id,
        p_expected_state: expected,
        p_next_state: next,
        p_repository_id: repositoryId,
        p_error_code: null,
      });
      if (data !== next) throw new GitHubStudioError("STORAGE_UNAVAILABLE");
      return data;
    },

    async finishWithAccess(id, created) {
      if (!uuid(id) || !positive(created?.repositoryId)) {
        throw new GitHubStudioError("INVALID_INPUT");
      }
      const data = await call("atlas_gh_studio_finalize_repository", {
        p_operation_id: id,
        p_repository_id: created.repositoryId,
      });
      if (data !== true) throw new GitHubStudioError("STORAGE_UNAVAILABLE");
      return true;
    },
  });
}
