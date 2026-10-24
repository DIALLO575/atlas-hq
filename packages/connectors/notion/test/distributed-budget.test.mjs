import test from "node:test";
import assert from "node:assert/strict";
import { createNotionDistributedBudget } from "../src/distributed-budget.mjs";
const key = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "11111111-1111-4111-8111-111111111111",
  connectionId: "123e4567-e89b-12d3-a456-426614174001",
  notionWorkspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  version: 1,
};
function fixture(store) {
  const events = [];
  const localBudget = {
    async beforeRequest() { events.push("local"); },
    observeRateLimit(seconds) { events.push(["local-cooldown",seconds]); },
  };
  const gate = createNotionDistributedBudget({
    binding: key, store, localBudget,
    wait: async ms => {events.push(["wait",ms]);},
  });
  return { gate, events };
}
test("distributed gate reserves through authenticated/versioned store before Notion call",async()=>{
  let sent;
  const {gate,events} = fixture({
    async reserve(binding){ sent=binding; return 350; },
    async cooldown(){return true;},
  });
  await gate.beforeRequest();
  assert.deepEqual(events, ["local",["wait",350]]);
  assert.deepEqual(sent, {...key,maxWaitMs:3000});
});
test("cross-worker cooldown failure blocks retries and retains process-local cooldown",async()=>{
  const {gate,events}=fixture({
    async reserve(){return 0;}, async cooldown(){throw Error("DB unavailable");},
  });
  await assert.rejects(gate.observeRateLimit(5),{code:"BUDGET_UNAVAILABLE"});
  assert.deepEqual(events,[["local-cooldown",5]]);
});
test("negative deferred slot is a bounded 429, not a long sleep",async()=>{
  const {gate,events}=fixture({
    async reserve(){return -29;}, async cooldown(){return true;},
  });
  await assert.rejects(gate.beforeRequest(),err=>
    err.code==="BUDGET_DEFERRED" && err.retryAfterSeconds===29);
  assert.deepEqual(events,["local"]);
});
test("invalid scope, stale versions and unavailable DB fail closed",async()=>{
  const {gate}=fixture({async reserve(){return null;},async cooldown(){return false;}});
  await assert.rejects(gate.beforeRequest(),{code:"BUDGET_UNAVAILABLE"});
  await assert.rejects(gate.observeRateLimit(1),{code:"BUDGET_UNAVAILABLE"});
  for(const version of [0,-1,NaN]) assert.throws(()=>
    createNotionDistributedBudget({binding:{...key,version},store:{
      reserve(){},cooldown(){}},localBudget:{
        beforeRequest(){},observeRateLimit(){},
      }}),{code:"INVALID_BUDGET_CONFIG"});
});
test("aborted caller does not issue distributed reservation",async()=>{
  let reservations=0;
  const {gate}=fixture({async reserve(){reservations++;return 0;},async cooldown(){return true;}});
  const controller=new AbortController();controller.abort();
  await assert.rejects(gate.beforeRequest(controller.signal),{code:"REQUEST_ABORTED"});
  assert.equal(reservations,0);
});

test("full standard UUIDs are valid but truncated UUIDs fail closed",()=>{
  assert.throws(()=>createNotionDistributedBudget({
    binding:{...key,userId:"11111111-1111-1111-111111111111"},
    store:{reserve:async()=>0,cooldown:async()=>true},
    localBudget:{beforeRequest:async()=>{},observeRateLimit(){}},
  }),{code:"INVALID_BUDGET_CONFIG"});
});
