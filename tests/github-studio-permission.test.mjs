import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { readStudioCreationPermission } from "../packages/connectors/github/src/github-studio-permission.mjs";

const {privateKey}=generateKeyPairSync("rsa", {modulusLength:2048, privateKeyEncoding:{type:"pkcs8",format:"pem"},
  publicKeyEncoding:{type:"spki",format:"pem"}});
const binding={workspaceId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", installationId:77, status:"repositories-ready",
 repositorySelection:"selected", ownershipVerifiedAt:"2026-10-24T12:00:00Z",repositoriesVerifiedAt:"2026-10-24T12:00:00Z"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const options=(request)=>({workspaceId:binding.workspaceId,installationId:77,binding,appId:"1234",privateKey,request});

test("live installation permission read verifies grant but never sends a mutation",async()=>{
 const calls=[];
 const request=async(url,init)=>{calls.push([url,init]);return json({id:77,target_type:"User", account:{login:"octocat"},
   repository_selection:"selected",permissions:{repository_creation:"write"},suspended_at:null});};
 assert.deepEqual(await readStudioCreationPermission(options(request)),{status:"granted"});
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],"https://api.github.com/app/installations/77");
 assert.equal(calls[0][1].method,"GET");
 assert.equal(calls[0][1].cache,"no-store");
 assert.equal(calls[0][1].redirect,"error");
});

test("app setting not approved by installation owner is not mistaken for granted",async()=>{
 const request=async()=>json({id:77,target_type:"User",account:{login:"octocat"},
  repository_selection:"selected",permissions:{pull_requests:"read"},suspended_at:null});
 assert.deepEqual(await readStudioCreationPermission(options(request)),{status:"missing"});
});

test("cross-workspace, suspended and organization installations fail closed",async()=>{
 let calls=0;
 await assert.rejects(readStudioCreationPermission({...options(()=>{calls++;return json({})}),
    workspaceId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}),e=>e.code==="GITHUB_NOT_AUTHORIZED");
 assert.equal(calls,0);
 for(const change of [
  {target_type:"Organization"}, {id:88}, {suspended_at:"2026-10-24T14:00:00Z"},
  {repository_selection:"all"}, {account:{login:"bad name"}},
 ]) {
  await assert.rejects(readStudioCreationPermission(options(async()=>json({
    id:77,target_type:"User",account:{login:"octocat"},repository_selection:"selected",
    permissions:{repository_creation:"write"},suspended_at:null,...change,
  })),e=>e.code==="GITHUB_NOT_AUTHORIZED");
 }
});
