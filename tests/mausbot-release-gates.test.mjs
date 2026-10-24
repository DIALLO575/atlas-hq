import test from "node:test";
import assert from "node:assert/strict";
import {mausbotReleaseState,mausbotReleasePermission}
  from "../packages/engine-core/src/release-gates.mjs";

test("Engine mutating transports remain hard blocked for every preconnection env stage",()=>{
 for(const stage of [undefined,"offline","read-only","enabled","unknown"]){
  const env={ATLAS_MAUSBOT_RELEASE_STAGE:stage,
    ATLAS_MAUSBOT_MUTATIONS_ACK:"I_ACKNOWLEDGE_ENGINE_ACTIONS",
    ATLAS_MAUSBOT_URL:"https://external.test",
    ATLAS_MAUSBOT_TOKEN:"dummy"};
  const result=mausbotReleaseState(env);
  assert.equal(result.mutationsEnabled,false);
  assert.equal(result.pending,"durable-engine-gate");
  for(const mode of ["write","execute"]){
    assert.deepEqual(mausbotReleasePermission(env,mode),
      {allowed:false,code:"MAUSBOT_DURABLE_APPROVAL_REQUIRED",status:423});
  }
 }
});
test("Read-only diagnostics remain opt-in while engine executor is locked",()=>{
 assert.equal(mausbotReleasePermission({},"read").allowed,false);
 assert.equal(mausbotReleasePermission({ATLAS_MAUSBOT_RELEASE_STAGE:"read-only"},"read").allowed,true);
 assert.equal(mausbotReleasePermission({ATLAS_MAUSBOT_RELEASE_STAGE:"enabled"},"read").allowed,true);
 assert.equal(mausbotReleaseState({ATLAS_MAUSBOT_RELEASE_STAGE:"enabled"}).stage,"read-only");
 assert.equal(mausbotReleasePermission({},"invalid").status,400);
});
