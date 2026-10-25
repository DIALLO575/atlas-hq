import test from "node:test";
import assert from "node:assert/strict";
import {createNotionReadClient,NotionReadError} from "../src/rest-client.mjs";
const VIEW="22222222-2222-4222-8222-222222222222";
const ID="view-query-123";
const reply=value=>({ok:true,status:200,headers:new Headers(),json:async()=>value});
test("native view query is created, then cache cleaned via exact DELETE path",async()=>{
 const calls=[];
 const client=createNotionReadClient({token:"PROVIDER_TOKEN",request:async(url,opts)=>{
   calls.push({url,opts});
   if(opts.method==="POST")return reply({object:"view_query",id:ID,
      view_id:VIEW,results:[],has_more:false});
   if(opts.method==="DELETE")return reply({object:"view_query",id:ID,deleted:true});
   throw Error("unapproved endpoint");
 }});
 const r=await client.previewView(VIEW,{size:12});
 assert.equal(r.id,ID);
 assert.equal(await client.releaseViewQuery(VIEW,r.id),true);
 assert.deepEqual(calls.map(x=>x.opts.method),["POST","DELETE"]);
 assert.equal(calls[1].url,"https://api.notion.com/v1/views/"+VIEW+"/queries/"+ID);
 assert.equal(calls[1].opts.headers.Authorization,"Bearer PROVIDER_TOKEN");
});
test("arbitrary query IDs and mismatched view results cannot become provider paths",async()=>{
 let calls=0;
 const client=createNotionReadClient({token:"abc",request:async()=>{
   calls++;return reply({object:"view_query",id:ID,deleted:true});
 }});
 for(const id of ["../views/OTHER","", "x?url=https://evil.test",
    "x".repeat(129),"x/y","%2F"]){
   await assert.rejects(client.releaseViewQuery(VIEW,id),{code:"INVALID_INPUT"});
 }
 await assert.rejects(client.releaseViewQuery("not-uuid",ID),{code:"INVALID_INPUT"});
 assert.equal(calls,0);
});
test("query cleanup no replay on network errors or HTTP 503",async()=>{
 let attempts=0;
 const client=createNotionReadClient({token:"abc",request:async()=>{
   attempts++;return {ok:false,status:503,headers:new Headers()};
 }});
 await assert.rejects(client.releaseViewQuery(VIEW,ID),err=>
   err instanceof NotionReadError && err.code==="PROVIDER_UNAVAILABLE");
 assert.equal(attempts,1);
});
test("invalid provider query ID is rejected before cleanup",async()=>{
 const client=createNotionReadClient({token:"abc",request:async()=>reply({
   object:"view_query",id:"../../bad",results:[],has_more:false,
 })});
 await assert.rejects(client.previewView(VIEW),{code:"INVALID_RESPONSE"});
});

test("cleanup never retries 429 or 529: remote outcome is not assumed",async()=>{
 for(const status of [429,529]){
   let attempts=0;
   const client=createNotionReadClient({token:"test",request:async()=>{
     attempts++;return {ok:false,status,headers:new Headers()};
   }});
   await assert.rejects(client.releaseViewQuery(VIEW,ID));
   assert.equal(attempts,1);
 }
});
