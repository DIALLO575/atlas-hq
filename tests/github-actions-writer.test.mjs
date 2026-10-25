import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import test from "node:test";
import {createGitHubActionsWriter} from "../packages/connectors/github/src/github-actions-writer.mjs";
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
 privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const now=Date.parse("2026-10-25T12:00:00Z"),SHA="a".repeat(40);
function fixture(overrides={}){
 const calls=[];
 async function request(url,opts){
  calls.push({url,opts});
  if(url.endsWith("/access_tokens")){
   assert.equal(opts.method,"POST");
   assert.deepEqual(JSON.parse(opts.body),{repository_ids:[91],permissions:{actions:"write"}});
   return json({token:"test-install-token",permissions:{actions:overrides.permission??"write"},
     expires_at:"2026-10-25T14:00:00Z",repositories:[{id:91}]},201);
  }
  assert.equal(opts.headers.Authorization,"Bearer test-install-token");
  if(url.includes("/installation/repositories"))return json({total_count:1,repositories:[{
    id:overrides.repoId??91,full_name:"octocat/atlas-test",owner:{login:"octocat"},
  }]});
  if(url.endsWith("/actions/runs/222"))return json({
    id:222,repository:{id:91},head_repository:{id:overrides.headRepo??91},run_attempt:2,
    head_sha:SHA,status:"completed",conclusion:"failure",event:"push",
    created_at:"2026-10-25T10:00:00Z",name:"CI",
  });
  if(url.endsWith("/actions/jobs/444") && opts.method==="GET")return json({
    id:444,run_id:222,run_attempt:overrides.attempt??2,status:"completed",
    conclusion:overrides.conclusion??"failure",name:"build",
  });
  if(url.endsWith("/actions/jobs/444/rerun")){
    assert.equal(opts.method,"POST");
    assert.deepEqual(JSON.parse(opts.body),{enable_debug_logging:false,enable_debugger:false});
    return new Response(null,{status:overrides.writeStatus??201});
  }
  throw Error("unexpected URL "+url);
 }
 return {calls,request};
}
const make=(request)=>createGitHubActionsWriter({
 installationId:77,repositoryId:91,appId:"1234",privateKey,request,now:()=>now,
});
const input={runId:222,jobId:444,attempt:2,sha:SHA};
test("writer only obtains a single-repository actions:write installation token",async()=>{
 const f=fixture();
 const writer=await make(f.request);
 const target=await writer.verifyFailedJob(input);
 assert.equal(target.jobName,"build");
 assert.equal(target.fullName,"octocat/atlas-test");
 assert.equal(f.calls.length,4);
 assert.ok(f.calls.every(c=>c.opts.cache==="no-store"&&c.opts.redirect==="error"));
 assert.ok(f.calls.every(c=>!c.url.endsWith("/rerun")));
});
test("explicitly dispatches one job, never a whole workflow",async()=>{
 const f=fixture();
 const w=await make(f.request);
 const target=await w.verifyFailedJob(input);
 const result=await w.dispatchJob(target);
 assert.deepEqual(result,{accepted:true,jobId:444,runId:222});
 assert.equal(f.calls.filter(c=>c.url.endsWith("/rerun")).length,1);
 assert.equal(f.calls.length,5);
});
test("rejects broader repository token and permissions not equal write",async()=>{
 const f=fixture({permission:"read"});
 await assert.rejects(make(f.request),e=>e.code==="PERMISSION_DENIED");
 const different=fixture({repoId:99});
 await assert.rejects(make(different.request),e=>e.code==="PERMISSION_DENIED");
});
test("rejects jobs from forks or stale attempt or non-failure",async()=>{
 for(const option of [{headRepo:92},{attempt:1},{conclusion:"success"}]){
  const f=fixture(option);
  const writer=await make(f.request);
  await assert.rejects(writer.verifyFailedJob(input),e=>["RUN_CHANGED_OR_UNSAFE","JOB_CHANGED_OR_UNSAFE"].includes(e.code));
  assert.ok(f.calls.every(c=>!c.url.endsWith("/rerun")));
 }
});
test("network errors after dispatch remain uncertain; no hidden retry",async()=>{
 const f=fixture({writeStatus:502});const w=await make(f.request);
 const target=await w.verifyFailedJob(input);
 await assert.rejects(w.dispatchJob(target),e=>e.code==="PROVIDER_UNCERTAIN");
 assert.equal(f.calls.filter(c=>c.url.endsWith("/rerun")).length,1);
});
