import { createHash } from "node:crypto";
import { parseRepositoryDraft, GitHubStudioError } from "./github-studio-create.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transitions = Object.freeze({
  prepared: ["dispatching", "failed"],
  dispatching: ["provider_confirmed", "reconciliation_required"],
  provider_confirmed: ["succeeded", "reconciliation_required"],
  reconciliation_required: ["succeeded"],
  succeeded: [],
  failed: [],
});
const statuses = new Set(Object.keys(transitions));
const events = new Set(["prepared", "dispatching", "provider_confirmed",
  "reconciliation_required", "succeeded", "failed"]);

/**
 * Pure intent state and SHA-256 fingerprint; no database or GitHub calls.
 * Persist a unique (workspace, actor, idempotencyKey) transactionally before
 * dispatching a provider write. Fail closed on mismatched retries.
 */
export function createRepositoryIntent({ draft, actorId, idempotencyKey }) {
  if (!UUID.test(actorId ?? "") || !UUID.test(idempotencyKey ?? "")) {
    throw new GitHubStudioError("INVALID_INPUT");
  }
  const parsed = parseRepositoryDraft(draft);
  const digest = createHash("sha256").update(JSON.stringify([
    "github-repository-create-v1", parsed.workspaceId,
    parsed.installationId, actorId, parsed.name,
    parsed.description, parsed.private, parsed.autoInit,
  ])).digest("hex");
  return Object.freeze({
    workspaceId: parsed.workspaceId,
    installationId: parsed.installationId,
    actorId, idempotencyKey,
    action: "repository.create",
    digest,
    status: "prepared",
  });
}

/**
 * Pure transition guard. An uncertain provider result is never treated as
 * a failed operation eligible for a blind retry.
 */
export function nextRepositoryOperationStatus(current, next) {
  if (!statuses.has(current) || !events.has(next) ||
      !transitions[current].includes(next)) {
    throw new GitHubStudioError("INVALID_OPERATION_TRANSITION");
  }
  return next;
}

export function assertMatchingRepositoryRetry(prior, candidate) {
  if (!prior || !candidate ||
      prior.workspaceId !== candidate.workspaceId ||
      prior.actorId !== candidate.actorId ||
      prior.idempotencyKey !== candidate.idempotencyKey ||
      prior.installationId !== candidate.installationId ||
      prior.digest !== candidate.digest ||
      prior.action !== candidate.action) {
    throw new GitHubStudioError("IDEMPOTENCY_CONFLICT");
  }
  return true;
}

export const repositoryOperationStates = Object.freeze(Object.keys(transitions));
