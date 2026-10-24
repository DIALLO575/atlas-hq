import test from "node:test";
import assert from "node:assert/strict";
import { classifyNotionAsyncTask, classifyNotionAsyncPollError,
  processOneNotionAsyncTask } from "../src/async-task-worker.mjs";
const taskId="task_valid123";
const claim={job_id:"11111111-1111-4111-8111-111111111111",
  lease_id:"22222222-2222-4222-8222-222222222222",provider_task_id:taskId};
test("Notion documented states are mapped without storing task result or error message",()=>{
  assert.deepEqual(classifyNotionAsyncTask({
    object:"async_task",id:taskId,status:"running",poll_after_seconds:4,
    result:{markdown:"SECRET"}},
    taskId),{outcome:"poll_again",delaySeconds:4,errorCode:null});
  assert.equal(classifyNotionAsyncTask({object:"async_task",id:taskId,
    status:"succeeded",result:{markdown:"SECRET"}},taskId).outcome,"succeeded");
  assert.equal(classifyNotionAsyncTask({object:"async_task",id:taskId,
    status:"failed",error:{message:"PRIVATE"}},taskId).errorCode,"provider_failed");
  assert.equal(classifyNotionAsyncTask({object:"async_task",id:"task_other",
    status:"succeeded"},taskId).errorCode,"invalid_response");
});
test("permanent and transient HTTP failures map to strict safe error codes",()=>{
  for(const [code,expected] of [["AUTH_REQUIRED","auth_required"],
    ["PERMISSION_DENIED","permission_denied"],
    ["NOT_FOUND_OR_HIDDEN","task_not_found"],
    ["RATE_LIMITED","provider_transient"],
    ["PROVIDER_OVERLOADED","provider_transient"]]) {
    assert.equal(classifyNotionAsyncPollError({code,message:"PRIVATE"}).errorCode,expected);
  }
  assert.equal(classifyNotionAsyncPollError({
    code:"RATE_LIMITED",retryAfterSeconds:120,
  }).delaySeconds,120);
});
test("poll worker processes exact lease and persists only outcome codes",async()=>{
  let saved,read=0;
  const out=await processOneNotionAsyncTask({
    store:{async claim(){return claim;},async finish(value){saved=value;return true;}},
    async readTask(c){read++;assert.equal(c.provider_task_id,taskId);
      return {object:"async_task",id:taskId,status:"retrying",
        poll_after_seconds:7,result:{markdown:"NEVER"}};
    },
  });
  assert.equal(read,1);
  assert.equal(out.state,"rescheduled");
  assert.deepEqual(saved,{jobId:claim.job_id,leaseId:claim.lease_id,
    outcome:"poll_again",delaySeconds:7,errorCode:null});
});
test("worker declines lost leases and does not start when queue empty",async()=>{
  const empty=await processOneNotionAsyncTask({store:{
    async claim(){return null;},async finish(){throw Error("not called");},
  },async readTask(){throw Error("not called");}});
  assert.equal(empty.state,"idle");
  await assert.rejects(processOneNotionAsyncTask({store:{
    async claim(){return claim;},async finish(){return false;},
  },async readTask(){return {object:"async_task",id:taskId,status:"succeeded"};}}),
  /ASYNC_LEASE_LOST/);
});
