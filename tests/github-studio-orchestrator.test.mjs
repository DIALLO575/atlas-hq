import assert from "node:assert/strict";
import test from "node:test";
import { coordinateRepositoryCreation } from "../packages/connectors/github/src/github-studio-orchestrator.mjs";
const id = "10000000-0000-4000-8000-000000000020";
const created = { repositoryId: 555, fullName: "octocat/atlas-test",
  url: "https://github.com/octocat/atlas-test" };

function fakeStore({ initial = "prepared" } = {}) {
  let state = initial;
  const events = [];
  const store = {
    reserve: async () => ({ operationId: id, state }),
    advance: async (_, expected, next, repoId) => {
      if (state !== expected) throw new Error("cas lost");
      events.push([expected,next,repoId]);
      state = next;
      return next;
    },
  };
  return { store, events, get state() { return state; } };
}

test("creates once, verifies live permission and commits repo grant only after proof", async () => {
  const s = fakeStore();
  let creates = 0, proofs = 0, finishes = 0;
  const result = await coordinateRepositoryCreation({
    intent: {}, store: s.store,
    create: async () => { creates++; return created; },
    verifyAccess: async (repo) => { proofs++; assert.deepEqual(repo,created); return true; },
    finishWithAccess: async () => { finishes++; return true; },
  });
  assert.equal(result.state, "succeeded");
  assert.equal(result.repository.id, 555);
  assert.equal(creates, 1); assert.equal(proofs,1); assert.equal(finishes,1);
  assert.deepEqual(s.events, [
    ["prepared","dispatching",undefined],
    ["dispatching","provider_confirmed",555],
  ]);
});

test("existing dispatched intents never execute the provider again", async () => {
  for (const initial of ["dispatching","provider_confirmed",
    "reconciliation_required","succeeded","failed"]) {
    const s = fakeStore({initial});
    const result = await coordinateRepositoryCreation({
      intent: {}, store:s.store,
      create: () => {throw Error("must not create");},
      verifyAccess: () => {throw Error("must not verify");},
      finishWithAccess: () => {throw Error("must not finish");},
    });
    assert.equal(result.state,initial);
    assert.equal(result.dispatched,false);
  }
});

test("only one concurrent coordinator can pass the dispatch CAS", async () => {
  const s = fakeStore();
  let creates = 0;
  const args = () => ({
    intent: {}, store:s.store,
    create: async () => {creates++;return created;},
    verifyAccess: async () => true,
    finishWithAccess: async () => true,
  });
  const results = await Promise.all([
    coordinateRepositoryCreation(args()),
    coordinateRepositoryCreation(args()),
  ]);
  assert.equal(creates,1);
  assert.equal(results.filter(x=>x.state==="succeeded").length,1);
  assert.equal(results.filter(x=>x.dispatched===false).length,1);
});

test("provider uncertainty is only reconciled, never retried", async () => {
  const s = fakeStore();
  let creates=0;
  const result = await coordinateRepositoryCreation({
    intent:{},store:s.store,
    create: async ()=>{creates++;throw Error("network timeout after POST");},
    verifyAccess:()=>{throw Error("no access check");},
    finishWithAccess:()=>{throw Error("no finish");},
  });
  assert.equal(result.state,"reconciliation_required");
  assert.equal(creates,1);
  assert.deepEqual(s.events,[
    ["prepared","dispatching",undefined],
    ["dispatching","reconciliation_required",null],
  ]);
});

test("missing grant and failed finalization never return success", async () => {
  for (const scenario of ["no-grant","finalize-failed","invalid-created"]) {
    const s = fakeStore(); let writes=0;
    const result = await coordinateRepositoryCreation({
      intent:{},store:s.store,
      create:async()=> scenario==="invalid-created" ? {repositoryId:0} : created,
      verifyAccess:async()=>scenario!=="no-grant",
      finishWithAccess:async()=>{writes++;throw Error("storage offline");},
    });
    assert.equal(result.state,"reconciliation_required");
    assert.equal(writes,scenario==="finalize-failed" ? 1 : 0);
  }
});
