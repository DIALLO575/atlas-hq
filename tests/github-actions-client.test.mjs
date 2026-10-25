import assert from "node:assert/strict";
import test from "node:test";
import {generateKeyPairSync} from "node:crypto";
import {createGitHubActionsReader} from "../packages/connectors/github/src/github-actions-client.mjs";

const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
  privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const makeRun=(id=204)=>({id,name:"CI",display_title:"Fix issue",status:"completed",conclusion:"failure",
 run_attempt:1,head_branch:"fix/actions",head_sha:"a".repeat(40),event:"pull_request",
 created_at:"2026-10-24T19:00:00Z",updated_at:"2026-10-24T19:02:00Z",
 repository:{id:91}});
function mock(overrides={}) {
 const calls=[];
 async function request(url,options) {
  calls.push({url,options});
  if(url.endsWith("/access_tokens")){
    assert.equal(options.method,"POST");
    assert.deepEqual(JSON.parse(options.body),{repository_ids:[91],permissions:{actions:"read"}});
    return json({token:"private-installation-token",expires_at:"2026-10-24T23:00:00Z",
      permissions:{actions:overrides.permission??"read"},repositories:[{id:91}]},201);
  }
  assert.equal(options.headers.Authorization,"Bearer private-installation-token");
  if(url.includes("/installation/repositories"))return json({
    total_count:1,repositories:[{id:overrides.actualId??91,
      full_name:"octocat/atlas-test",owner:{login:"octocat"}}]});
  if(url.endsWith("/actions/runs?per_page=20&page=1"))return json({
    total_count:1,workflow_runs:[makeRun()],
  });
  if(url.endsWith("/actions/runs/204"))return json({...makeRun(),repository:{id:91}});
  if(url.endsWith("/actions/runs/204/jobs?per_page=100&filter=latest"))return json({
    total_count:1,jobs:[{id:401,name:"build",status:"completed",conclusion:"failure",
      started_at:"2026-10-24T19:00:00Z",completed_at:"2026-10-24T19:02:00Z",
      steps:[{name:"npm test",number:2,conclusion:"failure"},
        {name:"Check out",number:1,conclusion:"success"}]}],
  });
  throw new Error("Unexpected URL "+url);
 }
 return {request,calls};
}
const create=(request)=>createGitHubActionsReader({
  installationId:77,repositoryId:91,appId:"1234",privateKey,
  request,now:()=>Date.parse("2026-10-24T20:00:00Z"),
});
test("Actions reader obtains read-only token strictly scoped to one verified repository",async()=>{
 const f=mock();const reader=await create(f.request);
 const runs=await reader.listRuns();
 assert.equal(runs.repository.fullName,"octocat/atlas-test");
 assert.equal(runs.runs[0].conclusion,"failure");
 assert.equal(runs.runs[0].url,"https://github.com/octocat/atlas-test/actions/runs/204");
 assert.equal(f.calls.length,3);
 assert.ok(f.calls.every(c=>c.options.cache==="no-store"&&c.options.redirect==="error"));
 assert.ok(f.calls.every(c=>!c.url.includes("/rerun")&&!c.url.includes("/dispatches")));
});
test("Actions job inspector finds failing steps and never retrieves private raw logs",async()=>{
 const f=mock();const reader=await create(f.request);const data=await reader.listJobs(204);
 assert.equal(data.run.id,204);
 assert.equal(data.jobs[0].failedSteps.length,1);
 assert.equal(data.jobs[0].failedSteps[0].name,"npm test");
 assert.ok(f.calls.every(c=>!c.url.includes("/logs")));
 assert.equal(f.calls.length,4);
});
test("a repo absent from current GitHub App grant is rejected",async()=>{
 const f=mock({actualId:92});
 await assert.rejects(create(f.request),(e)=>e.code==="PERMISSION_DENIED");
 assert.equal(f.calls.length,2);
});
test("missing Actions read permission cannot fall back to PR or public token",async()=>{
 const f=mock({permission:"pull_requests"});
 await assert.rejects(create(f.request),(e)=>e.code==="PERMISSION_DENIED");
 assert.equal(f.calls.length,1);
});
test("invalid repository input never mints a token",async()=>{
 let n=0;
 await assert.rejects(createGitHubActionsReader({
  installationId:77,repositoryId:-1,appId:"1234",privateKey,
  request:async()=>{n++;throw Error("must not call");}
 }),e=>e.code==="INVALID_INPUT");
 assert.equal(n,0);
});
