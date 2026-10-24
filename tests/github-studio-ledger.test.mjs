import assert from "node:assert/strict";
import test from "node:test";
import { createRepositoryIntent, assertMatchingRepositoryRetry,
  nextRepositoryOperationStatus, repositoryOperationStates,
} from "../packages/connectors/github/src/github-studio-ledger.mjs";
const id = "d7b94738-0703-49dd-9a3d-f19d1a4287ac";
const actor = "f8c9f97b-f7e0-4a9c-8195-489162104b30";
const idempotencyFixture = "00000000-0000-4000-8000-000000000001";
const options = (name = "studio-repo", privateFlag = true) => ({
  draft: { workspaceId: id, installationId: 77, name,
    description: "test project", private: privateFlag, autoInit: true },
  actorId: actor, idempotencyKey: idempotencyFixture,
});

test("fingerprint is deterministic and unique per actor, scope, name and visibility", () => {
  const base = createRepositoryIntent(options());
  assert.equal(base.status, "prepared");
  assert.equal(base.action, "repository.create");
  assert.match(base.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(base, createRepositoryIntent(options()));
  assert.notEqual(base.digest, createRepositoryIntent(options("different")).digest);
  assert.notEqual(base.digest, createRepositoryIntent(options("studio-repo", false)).digest);
  assert.notEqual(base.digest, createRepositoryIntent({ ...options(), actorId: id }).digest);
  assert.notEqual(base.digest, createRepositoryIntent({ ...options(),
    draft: { ...options().draft, workspaceId: actor } }).digest);
  assert.equal(assertMatchingRepositoryRetry(base, createRepositoryIntent(options())), true);
  assert.throws(() => assertMatchingRepositoryRetry(base,
    createRepositoryIntent(options("changed"))), (e) => e.code === "IDEMPOTENCY_CONFLICT");
  assert.throws(() => assertMatchingRepositoryRetry(base,
    createRepositoryIntent({ ...options(), idempotencyKey: id })),
  (e) => e.code === "IDEMPOTENCY_CONFLICT");
});

test("state machine never retries an uncertain GitHub POST automatically", () => {
  assert.deepEqual(repositoryOperationStates, [
    "prepared", "dispatching", "provider_confirmed",
    "reconciliation_required", "succeeded", "failed",
  ]);
  assert.equal(nextRepositoryOperationStatus("prepared", "dispatching"), "dispatching");
  assert.equal(nextRepositoryOperationStatus("dispatching", "provider_confirmed"), "provider_confirmed");
  assert.equal(nextRepositoryOperationStatus("dispatching", "reconciliation_required"), "reconciliation_required");
  assert.equal(nextRepositoryOperationStatus("reconciliation_required", "succeeded"), "succeeded");
  for (const [from, to] of [
    ["dispatching", "prepared"], ["dispatching", "failed"],
    ["reconciliation_required", "dispatching"],
    ["succeeded", "dispatching"], ["failed", "dispatching"],
    ["bogus", "prepared"],
  ]) assert.throws(() => nextRepositoryOperationStatus(from, to),
    (error) => error.code === "INVALID_OPERATION_TRANSITION");
});

test("invalid idempotency key or actor is rejected", () => {
  for (const args of [
    { ...options(), actorId: "bad" },
    { ...options(), idempotencyKey: "bad" },
    { ...options(), draft: { ...options().draft, owner: "spoof" } },
  ]) assert.throws(() => createRepositoryIntent(args), (e) => e.code === "INVALID_INPUT");
});
