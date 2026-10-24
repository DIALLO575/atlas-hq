import test from "node:test";
import assert from "node:assert/strict";
import {planEngineRegistration,planEngineRunDraft,EnginePersistenceInputError}
 from "../packages/engine-core/src/persistence-contracts.mjs";
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR="11111111-1111-4111-8111-111111111111";
const INSTANCE="aaaaaaaa-0000-4000-8000-000000000001";
const MISSION="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const IDEM="cccccccc-0000-4000-8000-000000000001";
const registration={workspaceId:A,createdBy:ACTOR,engineKey:"mausbot",label:"Research",
 transport:"http"};
const run={workspaceId:A,instanceId:INSTANCE,instanceWorkspaceId:A,
 missionId:MISSION,missionWorkspaceId:A,requestedBy:ACTOR,
 engineKey:"mausbot",primitiveId:"agents.list",idempotencyKey:IDEM,
 payloadSha256:"a".repeat(64)};
test("Engine registration is only offline metadata and never includes host URL or credential",()=>{
 const p=planEngineRegistration(registration);
 assert.equal(p.connectionState,"offline");
 assert.equal(p.engineKey,"mausbot");
 assert.equal(p.callable,false);
 assert.equal(p.requiresOwnerOrAdmin,true);
 assert.equal(p.requiresDatabaseAuthorization,true);
 assert.equal(Object.isFrozen(p),true);
 assert.equal("baseUrl" in p,false);
});
test("Mission-bound outbox drafts cannot be mistaken for authorized jobs",()=>{
 const p=planEngineRunDraft(run);
 assert.equal(p.state,"draft");
 assert.equal(p.canEnqueue,false);
 assert.equal(p.callable,false);
 assert.equal(p.requiresMissionBinding,true);
 assert.equal(p.requiresInstanceBinding,true);
 assert.equal(p.requiresEncryptedOutbox,true);
 assert.equal(p.requiresHumanApproval,false); // metadata read
 assert.equal(p.idempotencyKey,IDEM);
 assert.equal(p.payloadSha256,"a".repeat(64));
 assert.equal("payload" in p,false);
});
test("Write and execute plans require an independent human approval and cannot queue automatically",()=>{
 for(const primitiveId of ["agents.create","conversations.messages.send","jobs.interrupt"]){
  const p=planEngineRunDraft({...run,primitiveId});
  assert.equal(p.requiresHumanApproval,true);
  assert.equal(p.requiresIndependentApproval,true);
  assert.equal(p.canEnqueue,false);
  assert.equal(p.released,false);
 }
});
test("Cross-workspace references, undefined runtime and catalog-only native routes are rejected",()=>{
 for(const input of [
  {...run,instanceWorkspaceId:B},
  {...run,missionWorkspaceId:B},
  {...run,engineKey:"hermes"},
  {...run,primitiveId:"webhooks.rotate"},
  {...run,primitiveId:"computer.local.run"},
  {...run,primitiveId:"unknown"},
  {...run,idempotencyKey:"../other"},
  {...run,payloadSha256:"not-sha256"},
  {...run,workspaceId:"not-uuid"},
 ]) assert.throws(()=>planEngineRunDraft(input),EnginePersistenceInputError);
});
test("Explicitly forbid client credentials, raw prompt, hidden approval flags and unreviewed transports",()=>{
 for(const input of [
  {...registration,token:"secret"},
  {...registration,baseUrl:"https://unexpected.example"},
  {...registration,connectionState:"connected"},
  {...registration,engineKey:"hermes"},
  {...registration,label:" "},
  {...registration,transport:"https"},
 ])assert.throws(()=>planEngineRegistration(input),EnginePersistenceInputError);
 for(const input of [
  {...run,payload:"secret unencrypted"},
  {...run,approved:true},
  {...run,serverUrl:"https://attacker"},
  {...run,workspaceRole:"owner"},
 ])assert.throws(()=>planEngineRunDraft(input),EnginePersistenceInputError);
});
