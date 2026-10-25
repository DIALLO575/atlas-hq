import test from "node:test";
import assert from "node:assert/strict";
import {createNotionReadClient,NotionReadError}
  from "../src/rest-client.mjs";
const ID="123e4567-e89b-12d3-a456-426614174000";
const OTHER="223e4567-e89b-12d3-a456-426614174000";
const BASE={object:"page_markdown",id:ID,markdown:"# Plan",truncated:false,unknown_block_ids:[]};
const response=(value,status=200)=>({status,ok:status===200,
  headers:new Headers(),json:async()=>value});
test("Official markdown endpoint: fixed HTTPS, GET, Notion 2026-03-11",async()=>{
 const calls=[];
 const client=createNotionReadClient({token:"test-secret",request:async(url,opts)=>{
   calls.push({url,opts});return response(BASE);
 }});
 const result=await client.getPageMarkdown(ID);
 assert.equal(result.markdown,"# Plan");
 assert.equal(calls[0].url,"https://api.notion.com/v1/pages/"+ID+"/markdown");
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.headers["Notion-Version"],"2026-03-11");
 assert.equal(calls[0].opts.headers.Authorization,"Bearer test-secret");
 await assert.rejects(client.getPageMarkdown("https://malicious.example/"),{code:"INVALID_INPUT"});
 assert.equal(calls.length,1);
});
test("reject wrong IDs, malformed payloads, and oversize source",async()=>{
 for(const value of [{...BASE,id:OTHER},{...BASE,truncated:null},
   {...BASE,unknown_block_ids:["invalid"]},{...BASE,markdown:42}]){
   const client=createNotionReadClient({token:"test",request:async()=>response(value)});
   await assert.rejects(client.getPageMarkdown(ID),{code:"INVALID_RESPONSE"});
 }
 const client=createNotionReadClient({token:"test",request:async()=>
   response({...BASE,markdown:"x".repeat(64001)})});
 await assert.rejects(client.getPageMarkdown(ID),{code:"MARKDOWN_TOO_LARGE",status:413});
});
test("403 markdown denied with no provider-body leakage",async()=>{
 let calls=0;
 const client=createNotionReadClient({token:"test",request:async()=>{
   calls++;return response({access_token:"DO_NOT_LEAK"},403);
 }});
 await assert.rejects(client.getPageMarkdown(ID),err=>
   err instanceof NotionReadError && err.code==="PERMISSION_DENIED" &&
   !err.message.includes("DO_NOT_LEAK"));
 assert.equal(calls,1);
});
