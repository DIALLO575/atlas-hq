import test from "node:test";
import assert from "node:assert/strict";
import {mausbotReleaseState,mausbotReleasePermission} from "../packages/engine-core/src/release-gates.mjs";

test("No credentials nor host configuration alone can unlock engine transport",()=>{
 const variants=[{}, {ATLAS_MAUSBOT_RELEASE_STAGE:"offline"}, {ATLAS_MAUSBOT_RELEASE_STAGE:"enabled"}, {ATLAS_MAUSBOT_RELEASE_STAGE:"enable",ATLAS_MAUSBOT_MUTATIONS_ACK:"I_ACKNOWLEDGE_ENGINE_ACTIONS"}];
 for(const env of variants){
  if(env.ATLAS_MAUSBOT_RELEASE_STAGE==="enabled"){
   assert.equal(mausbotReleasePermission(env,"execute").allowed,false);
   continue;
  }
  assert.equal(mausbotReleasePermission(env,"read").allowed,false);
  assert.equal(mausbotReleasePermission(env,"write").allowed,false);
 }
});
test("Read-only stage permits reads, never writes or execution",()=>{
 const env={ATLAS_MAUSBOT_RELEASE_STAGE:"read-only",ATLAS_MAUSBOT_MUTATIONS_ACK:"I_ACKNOWLEDGE_ENGINE_ACTIONS"};
 assert.equal(mausbotReleaseState(env).stage,"read-only");
 assert.equal(mausbotReleasePermission(env,"read").allowed,true);
 assert.deepEqual(mausbotReleasePermission(env,"write"),{allowed:false,code:"MAUSBOT_PRECONNECTION_GATE_CLOSED",status:423});
 assert.equal(mausbotReleasePermission(env,"execute").allowed,false);
});
test("Only explicit dual acknowledgement can enable mutation after security review",()=>{
 const env={ATLAS_MAUSBOT_RELEASE_STAGE:"enabled",ATLAS_MAUSBOT_MUTATIONS_ACK:"I_ACKNOWLEDGE_ENGINE_ACTIONS"};
 assert.equal(mausbotReleasePermission(env,"read").allowed,true);
 assert.equal(mausbotReleasePermission(env,"write").allowed,true);
 assert.equal(mausbotReleasePermission(env,"execute").allowed,true);
 assert.equal(mausbotReleasePermission(env,"unknown").allowed,false);
});
