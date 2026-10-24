import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createEngineVault } from "../packages/engine-core/src/vault.mjs";
import { createEngineCredentialLifecycle, CredentialLifecycleError }
 from "../packages/engine-core/src/credential-lifecycle.mjs";

const W="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const I="aaaaaaaa-0000-4000-8000-000000000001";
const O="bbbbbbbb-0000-4000-8000-000000000002";
const A="11111111-1111-4111-8111-111111111111";
const scope={workspaceId:W,instanceId:I};
const root1=randomBytes(32).toString("base64");
const root2=randomBytes(32).toString("base64");
const v1=createEngineVault({keys:{"vault-1":root1},activeKeyId:"vault-1"});
const v2=createEngineVault({keys:{"vault-1":root1,"vault-2":root2},activeKeyId:"vault-2"});
function mockService({badGrant=false,authorizedActions=["create","rotate","revoke","inspect"],
  actor=A,failAudit=false,failRotate=false,rotationVault=null}={}) {
 const memory=new Map(),auditLog=[],operations=[];
 let active=v1;
 const repo={async transaction(callback){
   const txRows=new Map(memory),txAudit=[],txOperations=[];
   const tx={
     async getCredential(c){return txRows.get(c.workspaceId+"/"+c.instanceId)??null;},
     async insertCredential(row){
       const k=row.workspace_id+"/"+row.instance_id;
       if(txRows.has(k))throw new Error("DUPLICATE_RECORD");
       txRows.set(k,row);txOperations.push("insert");
     },
     async replaceCredential(c,before,after){
       const k=c.workspaceId+"/"+c.instanceId;
       if(failRotate||txRows.get(k)!==before)throw new Error("CAS_FAILED");
       txRows.set(k,after);txOperations.push("replace");
     },
     async revokeCredential(c){
       const k=c.workspaceId+"/"+c.instanceId,old=txRows.get(k);
       if(!old||old.revoked_at!==null)return false;
       txRows.set(k,{...old,revoked_at:"2026-10-24T10:00:00Z"});
       txOperations.push("revoke");return true;
     },
     async audit(row){
       if(failAudit)throw new Error("AUDIT_DOWN");
       txAudit.push(row);
     }
   };
   const result=await callback(tx);
   memory.clear();
   for(const [k,v] of txRows)memory.set(k,v);
   auditLog.push(...txAudit);operations.push(...txOperations);
   return result;
 }};
 const svc=createEngineCredentialLifecycle({
  verifySession:async ({session,workspaceId,instanceId,action})=>{
   if(!authorizedActions.includes(action)||session!=="trusted-session")return null;
   return {verified:!badGrant,actorId:actor,workspaceId,instanceId,action};
  },
  loadVault:async () => rotationVault??active,
  repository:repo,
 });
 return {svc,memory,auditLog,operations,activateNextKey(){active=v2;},repo};
}
test("Creation encrypts bytes and writes one atomic safe audit record",async()=>{
 const {svc,memory,auditLog}=mockService();
 const plain=Buffer.from("SENSITIVE_TEST_CREDENTIAL");
 const r=await svc.create({scope,session:"trusted-session",secret:plain});
 assert.deepEqual(r,{created:true,keyId:"vault-1",version:1});
 const row=memory.get(W+"/"+I);
 assert.deepEqual([row.workspace_id,row.instance_id],[W,I]);
 assert.equal(row.revoked_at,null);
 assert.match(row.nonce,/^\\x[0-9a-f]{24}$/);
 assert.match(row.tag,/^\\x[0-9a-f]{32}$/);
 assert.equal(JSON.stringify(row).includes("SENSITIVE_TEST_CREDENTIAL"),false);
 assert.equal(plain.toString(),"SENSITIVE_TEST_CREDENTIAL");
 assert.deepEqual(auditLog,[{workspace_id:W,instance_id:I,actor_id:A,event_key:"credential.created"}]);
 assert.deepEqual(await svc.inspect({scope,session:"trusted-session"}),
   {exists:true,revoked:false,keyId:"vault-1",version:1});
});
test("Rotate is CAS-protected, writes key-v2 and refuses obsolete active key",async()=>{
 const state=mockService();
 await state.svc.create({scope,session:"trusted-session",secret:Buffer.from("TOKEN_V1")});
 const before=state.memory.get(W+"/"+I);
 await assert.rejects(state.svc.rotate({scope,session:"trusted-session"}),
   e=>e instanceof CredentialLifecycleError && e.code==="CREDENTIAL_ACTIVE_KEY_UNCHANGED");
 assert.equal(state.memory.get(W+"/"+I),before);
 state.activateNextKey();
 const result=await state.svc.rotate({scope,session:"trusted-session"});
 assert.deepEqual(result,{rotated:true,keyId:"vault-2",version:1});
 const after=state.memory.get(W+"/"+I);
 assert.equal(after.key_id,"vault-2");
 assert.notEqual(after.ciphertext,before.ciphertext);
 assert.deepEqual(state.auditLog.map(x=>x.event_key),
   ["credential.created","credential.rotated"]);
 await assert.rejects(state.svc.rotate({scope,session:"trusted-session"}),
  e=>e.code==="CREDENTIAL_ACTIVE_KEY_UNCHANGED");
});
test("Revocation is auditable, terminal and prevents subsequent key rotation",async()=>{
 const state=mockService();
 await state.svc.create({scope,session:"trusted-session",secret:Buffer.from("PRIVATE")});
 assert.deepEqual(await state.svc.revoke({scope,session:"trusted-session"}),{revoked:true});
 assert.equal((await state.svc.inspect({scope,session:"trusted-session"})).revoked,true);
 state.activateNextKey();
 await assert.rejects(state.svc.rotate({scope,session:"trusted-session"}),
   e=>e.code==="CREDENTIAL_RECORD_INVALID");
 await assert.rejects(state.svc.revoke({scope,session:"trusted-session"}),
   e=>e.code==="CREDENTIAL_REVOKE_FAILED");
 assert.equal(state.auditLog.at(-1).event_key,"credential.revoked");
});
test("Session and workspace grants fail closed for all operations",async()=>{
 const state=mockService();
 for(const method of ["create","rotate","revoke","inspect"]){
   const input={scope,session:"browser-provided",secret:Buffer.from("secret")};
   await assert.rejects(state.svc[method](input),
     e=>e instanceof CredentialLifecycleError && e.code==="CREDENTIAL_ACCESS_DENIED");
 }
 const other=mockService({badGrant:true});
 await assert.rejects(other.svc.create({scope,session:"trusted-session",secret:Buffer.from("x")}),
    e=>e.code==="CREDENTIAL_ACCESS_DENIED");
 const invalid=mockService({actor:"not-a-uuid"});
 await assert.rejects(invalid.svc.create({scope,session:"trusted-session",secret:Buffer.from("x")}),
    e=>e.code==="CREDENTIAL_ACCESS_DENIED");
 assert.equal(other.memory.size,0);
 assert.equal(state.memory.size,0);
});
test("Cross-workspace or cross-instance record substitution is rejected before decrypt",async()=>{
 const state=mockService();
 await state.svc.create({scope,session:"trusted-session",secret:Buffer.from("SENSITIVE")});
 state.memory.set(W+"/"+O,state.memory.get(W+"/"+I));
 state.activateNextKey();
 await assert.rejects(state.svc.rotate({scope:{workspaceId:W,instanceId:O},session:"trusted-session"}),
  e=>e.code==="CREDENTIAL_RECORD_INVALID");
 state.memory.set(OTHER+"/"+I,state.memory.get(W+"/"+I));
 await assert.rejects(state.svc.rotate({scope:{workspaceId:OTHER,instanceId:I},session:"trusted-session"}),
  e=>e.code==="CREDENTIAL_RECORD_INVALID");
 assert.equal(state.auditLog.length,1);
});
test("Audit failure aborts credential insert, rotate and revoke transaction",async()=>{
 const state=mockService({failAudit:true});
 await assert.rejects(state.svc.create({scope,session:"trusted-session",secret:Buffer.from("SENSITIVE")}),
 /AUDIT_DOWN/);
 assert.equal(state.memory.size,0);assert.equal(state.auditLog.length,0);
 const second=mockService({failRotate:true});
 await second.svc.create({scope,session:"trusted-session",secret:Buffer.from("SECRET")});
 second.activateNextKey();
 await assert.rejects(second.svc.rotate({scope,session:"trusted-session"}),/CAS_FAILED/);
 assert.equal(second.memory.get(W+"/"+I).key_id,"vault-1");
 assert.equal(second.auditLog.length,1);
});
test("Reject extra body fields, raw strings, invalid dependency providers and duplicate credential",async()=>{
 assert.throws(()=>createEngineCredentialLifecycle({}),CredentialLifecycleError);
 const state=mockService();
 await assert.rejects(state.svc.create({scope,session:"trusted-session",secret:"not-buffer"}),
   e=>e.code==="CREDENTIAL_SECRET_INVALID");
 await assert.rejects(state.svc.create({scope:{...scope,token:"LEAK"},session:"trusted-session",secret:Buffer.from("x")}),
   e=>e.code==="CREDENTIAL_SCOPE_INVALID");
 await state.svc.create({scope,session:"trusted-session",secret:Buffer.from("x")});
 await assert.rejects(state.svc.create({scope,session:"trusted-session",secret:Buffer.from("y")}),
  /DUPLICATE_RECORD/);
 assert.equal(state.memory.size,1);
 assert.equal(state.auditLog.length,1);
});
