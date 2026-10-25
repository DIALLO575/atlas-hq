import test from "node:test";
import assert from "node:assert/strict";
import {projectNotionDatabaseSources as databases,
projectNotionDataSourceSchema as schema,projectNotionDataSourceRows as rows}
from "../src/data-source-projection.mjs";
const DB="123e4567-e89b-12d3-a456-426614174000";
const DS="223e4567-e89b-12d3-a456-426614174000";
const PAGE="323e4567-e89b-12d3-a456-426614174000";
const cfg={object:"data_source",id:DS,properties:{
 Name:{id:"title",name:"Nom",type:"title",title:{}},
 Status:{id:"status",type:"status",status:{options:[{name:"En cours",color:"blue",token:"SECRET"}]}},
 Amount:{id:"amount",type:"number",number:{format:"dollar"}},
 Formula:{id:"formula",type:"formula",formula:{expression:"prop('secret')"}},
 Relation:{id:"rel",type:"relation",relation:{data_source_id:"hidden-ID"}},
 Attachment:{id:"files",type:"files"},Assignee:{id:"people",type:"people"},Email:{id:"email",type:"email"},
}};
test("database contains references not raw child data; deduplicate and bound",()=>{
 const v=databases({object:"database",id:DB,data_sources:[
  {id:DS,name:"Projects",access_token:"SECRET"},{id:DS,name:"DUP"}]},DB);
 assert.deepEqual(v.results,[{id:DS,name:"Projects"}]);
 assert.equal(JSON.stringify(v).includes("SECRET"),false);
 assert.throws(()=>databases({object:"database",id:DS,data_sources:[]},DB));
});
test("schema shows column names, type and statuses but never formula or relation details",()=>{
 const s=schema(cfg,DS);
 assert.equal(s.columns[0].type,"title");
 assert.deepEqual(s.columns.find(x=>x.type==="status").options,["En cours"]);
 assert.equal(s.propertyCount,8);
 assert.equal(JSON.stringify(s).includes("prop('secret')"),false);
 assert.equal(JSON.stringify(s).includes("hidden-ID"),false);
});
test("row values include status, formula and relation counts with PII/file suppression",()=>{
 const s=schema(cfg,DS);
 const item={object:"page",id:PAGE,parent:{type:"data_source_id",data_source_id:DS},
   url:"https://www.notion.so/"+PAGE,access_token:"PROVIDER_TOKEN",properties:{
   Name:{type:"title",title:[{plain_text:"Roadmap"}]},
   Status:{type:"status",status:{name:"En cours"}},
   Amount:{type:"number",number:34},
   Formula:{type:"formula",formula:{type:"number",number:68,expression:"SECRET"}},
   Relation:{type:"relation",relation:[{id:DB},{id:DS}]},
   Attachment:{type:"files",files:[{name:"A",file:{url:"https://secret-s3?TOKEN"}}]},
   Assignee:{type:"people",people:[{name:"SECRET NAME",email:"PRIVATE"}]},
   Email:{type:"email",email:"private@example.org"},
 }};
 const output=rows({results:[item],has_more:false,next_cursor:null},DS,s);
 assert.equal(output.results[0].title,"Roadmap");
 assert.equal(output.results[0].cells.find(c=>c.name==="Status").value,"En cours");
 assert.equal(output.results[0].cells.find(c=>c.name==="Email").value,"Donnée personnelle masquée");
 for(const forbidden of ["SECRET","PRIVATE","private@example.org","secret-s3"]){
   assert.equal(JSON.stringify(output).includes(forbidden),false,forbidden);
 }
});
test("reject cross source, forged missing schema, unsafe pagination",()=>{
 const s=schema(cfg,DS);
 assert.throws(()=>schema({...cfg,id:DB},DS));
 assert.throws(()=>rows({results:[],has_more:true,next_cursor:null},DS,s));
 assert.throws(()=>rows({results:[],has_more:false,next_cursor:null},DB,s));
 const foreign={object:"page",id:PAGE,parent:{type:"data_source_id",data_source_id:DB},properties:{}};
 assert.equal(rows({results:[foreign],has_more:false},DS,s).results.length,0);
});
test("nested signed URLs never appear via rich text or formula values",()=>{
 const s=schema(cfg,DS);
 const item={object:"page",id:PAGE,properties:{
  Name:{type:"title",title:[{plain_text:"https://notion.so/a?X-Amz-Signature=TOPSECRET"}]},
  Formula:{type:"formula",formula:{type:"string",string:"https://files.notion.so/?token=HIDDEN"}},
 }};
 const out=rows({results:[item],has_more:false},DS,s);
 assert.equal(JSON.stringify(out).includes("TOPSECRET"),false);
 assert.equal(JSON.stringify(out).includes("HIDDEN"),false);
});

test("partial schema is declared even with fewer returned rows",()=>{
 const many=Object.fromEntries(Array.from({length:18},(_,i)=>[
   "Column"+i,{id:"col"+i,name:"Column "+i,type:i===0?"title":"rich_text"}]));
 const s=schema({object:"data_source",id:DS,properties:many},DS);
 assert.equal(s.columns.length,14);
 assert.equal(s.truncated,true);
 const out=rows({results:[],has_more:false,next_cursor:null},DS,s);
 assert.equal(out.truncated,true);
});
test("prototype-like property names do not expose inherited page fields",()=>{
 const malicious=JSON.parse('{"__proto__":{"type":"rich_text","name":"Prototype"}}');
 const s=schema({object:"data_source",id:DS,properties:malicious},DS);
 const result=rows({results:[{object:"page",id:PAGE,properties:{}}],
   has_more:false,next_cursor:null},DS,s);
 assert.deepEqual(result.results[0].cells,[{name:"Prototype",value:""}]);
 assert.equal(({}).polluted,undefined);
});
