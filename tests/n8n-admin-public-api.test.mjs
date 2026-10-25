import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { callN8nPublicAdminApi, resolveN8nReadOnlyConfig, N8nReadOnlyError }
  from "../packages/engines/n8n/src/adapter.mjs";

const W="123e4567-e89b-42d3-a456-426614174000";
const token="only-for-unit-testing-not-a-secret";
const config=resolveN8nReadOnlyConfig({
  ATLAS_N8N_WORKSPACE_ID:W,ATLAS_N8N_BASE_URL:"https://ops.example.org/",
  ATLAS_N8N_ALLOWED_HOST:"ops.example.org",ATLAS_N8N_API_KEY:token,
},W);
const records=[];
function stub(status=200,body={ok:true}){
 return (url,opts,cb)=>{
  records.push({url,opts});
  const req=new EventEmitter();
  req.setTimeout=()=>req;req.destroy=()=>req;
  req.end=payload=>{
    records.at(-1).payload=payload;
    opts.lookup(new URL(url).hostname,{},(err,ip,family)=>{
      assert.ifError(err);assert.equal(ip,"8.8.8.8");assert.equal(family,4);
    });
    const response=new PassThrough();
    response.statusCode=status;
    response.headers=status===204?{}:{"content-type":"application/json"};
    cb(response);response.end(status===204?"":JSON.stringify(body));
  };return req;
 };
}
const deps=(status,body)=>({
 dnsLookup:async()=>[{address:"8.8.8.8",family:4}],httpsRequestImpl:stub(status,body)
});
const rejected=code=>err=>err instanceof N8nReadOnlyError&&err.code===code;
test("API admin GET binds public IP, SNI, TLS and exact API key to one host",async()=>{
 records.length=0;
 const data=await callN8nPublicAdminApi(config,{method:"GET",path:"workflows",query:{limit:5}},deps(200,{data:[]}));
 assert.deepEqual(data,{data:[]});assert.equal(records.length,1);
 assert.equal(records[0].opts.method,"GET");assert.equal(records[0].opts.rejectUnauthorized,true);
 assert.equal(records[0].opts.servername,"ops.example.org");assert.equal(records[0].opts.agent,false);
 assert.equal(records[0].payload,undefined);
 assert.equal(new URL(records[0].url).searchParams.get("limit"),"5");
 assert.equal(records[0].opts.headers["X-N8N-API-KEY"],token);
});
test("POST PUT PATCH DELETE send bounded JSON without changing TLS destination",async()=>{
 for(const method of ["POST","PUT","PATCH","DELETE"]){
   records.length=0;
   const data=await callN8nPublicAdminApi(config,{method,path:"workflows/abc123",body:{name:"Test",nodes:[]}},deps(200,{id:"abc123"}));
   assert.equal(data.id,"abc123");assert.equal(records[0].opts.method,method);
   assert.equal(records[0].opts.headers["Content-Type"],"application/json");
   assert.equal(records[0].opts.headers["Content-Length"],Buffer.byteLength(records[0].payload));
   assert.deepEqual(JSON.parse(records[0].payload),{name:"Test",nodes:[]});
 }
 assert.deepEqual(await callN8nPublicAdminApi(config,{method:"DELETE",path:"workflows/abc123"},deps(204)),{ok:true,status:204});
});
test("bad methods, URLs, path traversal, credentials, query or GET body are refused before networking",async()=>{
 for(const path of ["https://evil.test/api/v1","/workflows","workflows/../admin","workflows/%2e%2e/admin","workflows?x=1","workflows#admin","rest/login","api/v1/admin","workflows//abc"])
   await assert.rejects(callN8nPublicAdminApi(config,{method:"GET",path},deps(200)),rejected("N8N_ADMIN_PATH_INVALID"));
 for(const method of ["HEAD","OPTIONS","TRACE"])
   await assert.rejects(callN8nPublicAdminApi(config,{method,path:"workflows"},deps(200)),rejected("N8N_ADMIN_METHOD_INVALID"));
 await assert.rejects(callN8nPublicAdminApi(config,{method:"GET",path:"workflows",body:{}},deps(200)),rejected("N8N_ADMIN_BODY_FORBIDDEN"));
 await assert.rejects(callN8nPublicAdminApi(config,{method:"POST",path:"workflows",token},deps(200)),rejected("N8N_ADMIN_REQUEST_INVALID"));
 await assert.rejects(callN8nPublicAdminApi(config,{method:"GET",path:"workflows",query:{"../url":"x"}},deps(200)),rejected("N8N_ADMIN_QUERY_INVALID"));
 let calls=0;
 await assert.rejects(callN8nPublicAdminApi(config,{method:"DELETE",path:"workflows/abc123"},{
   dnsLookup:async()=>[{address:"8.8.8.8",family:4},{address:"10.0.0.1",family:4}],
   httpsRequestImpl:()=>{calls++;throw Error("blocked");},
 }),rejected("N8N_NETWORK_DESTINATION_REFUSED"));
 assert.equal(calls,0);
});
test("redirect and unauthorized errors do not leak the API key",async()=>{
 for(const [status,code] of [[302,"N8N_REDIRECT_REFUSED"],[401,"N8N_AUTH_REFUSED"]])
   await assert.rejects(callN8nPublicAdminApi(config,{method:"POST",path:"workflows"},deps(status,{secret:token})),rejected(code));
});
test("Next API admin route enforces Atlas owner, origin and manual confirmation",async()=>{
 const route=await readFile(new URL("../src/app/api/apps/n8n/admin/route.ts",import.meta.url),"utf8");
 assert.match(route,/requireEngineWorkspace\(workspaceId, true\)/);
 assert.match(route,/access\.role !== "owner"/);
 assert.match(route,/origin.*request\.nextUrl\.origin/);
 assert.match(route,/input\.confirmation !== "CONFIRM " \+ input\.method \+ " " \+ input\.path/);
 assert.match(route,/resolveN8nReadOnlyConfig\(process\.env, workspaceId\)/);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE|apiKey\s*:/);
 const ui=await readFile(new URL("../src/components/n8n-admin-studio.tsx",import.meta.url),"utf8");
 assert.match(ui,/isOwner/);assert.match(ui,/\/api\/apps\/n8n\/admin/);
 assert.doesNotMatch(ui,/ATLAS_N8N_API_KEY|NEXT_PUBLIC_N8N/);
});
