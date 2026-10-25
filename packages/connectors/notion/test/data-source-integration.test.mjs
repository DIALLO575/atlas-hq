import test from "node:test";
import assert from "node:assert/strict";
import { createNotionReadClient, NotionReadError } from "../src/rest-client.mjs";
import { projectNotionDatabaseSources, projectNotionDataSourceSchema,
  projectNotionDataSourceRows } from "../src/data-source-projection.mjs";
const DB="123e4567-e89b-12d3-a456-426614174000";
const DS="223e4567-e89b-12d3-a456-426614174000";
const P="323e4567-e89b-12d3-a456-426614174000";
const schema={object:"data_source",id:DS,properties:{
 Name:{id:"title",type:"title",name:"Nom"},Status:{id:"s",type:"status",name:"Statut"}}};
const listed={object:"database",id:DB,data_sources:[{id:DS,name:"Projets"}]};
const row={object:"page",id:P,parent:{type:"data_source_id",data_source_id:DS},
  properties:{Name:{type:"title",title:[{plain_text:"Prochaine livraison"}]},
   Status:{type:"status",status:{name:"En cours"}}},
  url:"https://www.notion.so/"+P,access_token:"NEVER_TO_BROWSER"};
const page1={object:"list",results:[row],has_more:true,next_cursor:"next"};
const page2={object:"list",results:[{...row,id:DB,properties:{...row.properties,
  Name:{type:"title",title:[{plain_text:"Deuxième ligne"}]}}}],
  has_more:false,next_cursor:null};
const answer=v=>({ok:true,status:200,headers:new Headers(),json:async()=>v});
test("end-to-end mocked database→source→rows fixed-origin and actor token scoped",async()=>{
 const calls=[];
 const client=createNotionReadClient({token:"scope-only",request:async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith("/databases/"+DB))return answer(listed);
   if(url.endsWith("/data_sources/"+DS))return answer(schema);
   if(url.endsWith("/data_sources/"+DS+"/query"))return answer(
      JSON.parse(options.body).start_cursor==="next"?page2:page1);
   throw Error("unexpected provider path");
 }});
 const db=projectNotionDatabaseSources(await client.getDatabase(DB),DB);
 const source=db.results[0].id;
 const columns=projectNotionDataSourceSchema(await client.getDataSource(source),source);
 const first=projectNotionDataSourceRows(await client.queryDataSource(source,{size:12}),source,columns);
 const next=projectNotionDataSourceRows(await client.queryDataSource(source,{
   size:12,startCursor:first.nextCursor}),source,columns);
 assert.equal(db.results[0].name,"Projets");
 assert.equal(first.results[0].cells[0].value,"Prochaine livraison");
 assert.equal(first.hasMore,true);
 assert.equal(next.results[0].title,"Deuxième ligne");
 assert.equal(next.hasMore,false);
 assert.equal(calls.length,4);
 assert.deepEqual(calls.map(c=>c.options.method),["GET","GET","POST","POST"]);
 assert.ok(calls.every(c=>c.url.startsWith("https://api.notion.com/v1/")));
 assert.ok(calls.every(c=>c.options.headers.Authorization==="Bearer scope-only"));
 assert.ok(calls.every(c=>c.options.headers["Notion-Version"]==="2026-03-11"));
 assert.equal(JSON.stringify(first).includes("NEVER_TO_BROWSER"),false);
});
test("provider-hidden database returns 404, without body leakage or cross-origin fallback",async()=>{
 let requests=0;
 const client=createNotionReadClient({token:"token",request:async()=>{
   requests++;return {ok:false,status:404,headers:new Headers(),
     json:async()=>({message:"SECRET_PROVIDER_BODY"})};
 }});
 await assert.rejects(client.getDataSource(DS),e=>
   e instanceof NotionReadError && e.code==="NOT_FOUND_OR_HIDDEN" &&
   !e.message.includes("SECRET"));
 assert.equal(requests,1);
});
test("no query POST replay on provider error 503",async()=>{
 let requests=0;
 const client=createNotionReadClient({token:"token",request:async(_url,opt)=>{
   requests++; assert.equal(opt.method,"POST");
   return {ok:false,status:503,headers:new Headers()};
 }});
 await assert.rejects(client.queryDataSource(DS,{size:12}),{code:"PROVIDER_UNAVAILABLE"});
 assert.equal(requests,1);
});
test("never accept browser-originated unsafe filters or resource paths",async()=>{
 let calls=0;
 const client=createNotionReadClient({token:"token",request:async()=>{
   calls++;return answer(page1);
 }});
 await assert.rejects(client.queryDataSource("https://evil.test",{size:12}),{code:"INVALID_INPUT"});
 await assert.rejects(client.queryDataSource(DS,{size:100}),{code:"INVALID_INPUT"});
 await assert.rejects(client.queryDataSource(DS,{filter:{__proto__:null,or:[]}}),{code:"INVALID_INPUT"});
 assert.equal(calls,0);
});
