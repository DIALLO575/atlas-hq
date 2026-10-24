import { GitHubStudioError } from "./github-studio-create.mjs";

const safeId = (id) => typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const validCreated = (created) =>
  created && Number.isSafeInteger(created.repositoryId) && created.repositoryId > 0 &&
  typeof created.fullName === "string" &&
  /^[-\w.]+\/[-\w.]+$/.test(created.fullName) &&
  created.url === `https://github.com/${created.fullName}`;

/**
 * GitHub Studio create coordinator (SHA-155). A pure async orchestration layer
 * with INJECTED provider/DB collaborators. It is not connected to any
 * HTTP endpoint or live GitHub credentials yet.
 *
 * Server contract:
 *   reserve(intent): atomic stored intent from verified workspace actor.
 *   advance(id, expected, next, repositoryId?): CAS + audit, exactly one dispatch winner.
 *   create(): real provider createPersonalRepository when granted.
 *   verifyAccess(created): GitHub live grant check, returns boolean.
 *   finishWithAccess(id, created): atomic authorized repo grant + succeeded state + audit.
 * Never retry a provider POST after an uncertain outcome.
 */
export async function coordinateRepositoryCreation({
  intent, store, create, verifyAccess, finishWithAccess,
}) {
  if (!intent || !store || typeof store.reserve !== "function" ||
      typeof store.advance !== "function" || typeof create !== "function" ||
      typeof verifyAccess !== "function" || typeof finishWithAccess !== "function") {
    throw new GitHubStudioError("INVALID_INPUT");
  }
  const saved = await store.reserve(intent);
  if (!safeId(saved?.operationId) || typeof saved.state !== "string") {
    throw new GitHubStudioError("STORAGE_UNAVAILABLE");
  }
  const id = saved.operationId;
  if (saved.state !== "prepared") {
    return Object.freeze({ operationId: id, state: saved.state, dispatched: false });
  }

  // The PostgreSQL CAS must be committed BEFORE contacting GitHub.
  // Losing a race never permits a second POST.
  try {
    const newState = await store.advance(id, "prepared", "dispatching");
    if (newState !== "dispatching") {
      return Object.freeze({ operationId: id, state: "dispatching", dispatched: false });
    }
  } catch {
    return Object.freeze({ operationId: id, state: "dispatching", dispatched: false });
  }

  async function needsReconciliation(expectedState, repositoryId = null) {
    try {
      await store.advance(id, expectedState, "reconciliation_required", repositoryId);
    } catch {
      // Avoid false success: the transaction may have failed. An operator
      // must inspect the durable dispatching/provider-confirmed operation.
    }
    return Object.freeze({ operationId: id, state: "reconciliation_required", dispatched: true });
  }

  let created;
  try {
    created = await create();
    if (!validCreated(created)) return needsReconciliation("dispatching");
    const state = await store.advance(id, "dispatching", "provider_confirmed", created.repositoryId);
    if (state !== "provider_confirmed") return needsReconciliation("dispatching", created.repositoryId);
  } catch {
    // A network error or missing DB result cannot prove GitHub did not create it.
    return needsReconciliation("dispatching", validCreated(created) ? created.repositoryId : null);
  }

  try {
    if (!(await verifyAccess(created))) {
      return needsReconciliation("provider_confirmed", created.repositoryId);
    }
    // Finalization MUST be a single DB transaction that upserts the verified
    // repository access and changes provider_confirmed->succeeded atomically.
    const committed = await finishWithAccess(id, created);
    if (committed === true) {
      return Object.freeze({ operationId: id, state: "succeeded",
        dispatched: true, repository: Object.freeze({
          id: created.repositoryId, name: created.fullName, url: created.url,
        }) });
    }
  } catch {
    // Never call create() again or claim a successful reconciliation.
  }
  return needsReconciliation("provider_confirmed", created.repositoryId);
}
