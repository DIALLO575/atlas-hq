import test from "node:test";
import assert from "node:assert/strict";
import {projectNotionViewMetadata as project} from "../src/view-metadata.mjs";
const VIEW="22222222-2222-4222-8222-222222222222";
const DB="123e4567-e89b-12d3-a456-426614174000";
const DS="223e4567-e89b-12d3-a456-426614174000";
const OTHER="323e4567-e89b-12d3-a456-426614174000";
const view={object:"view",id:VIEW,parent:{type:"database_id",database_id:DB},
 data_source_id:DS,name:"En cours",type:"board",
 url:"https://www.notion.so/"+DB+"?v="+VIEW,
 filter:{property:"Status",status:{equals:"SECRET_FILTER_VALUE"}},
 sorts:[{property:"Urgence",direction:"descending",otherSecret:"SECRET_SORT"}],
 quick_filters:{Password:{rich_text:{equals:"SECRET_QUICK"}}},
 configuration:{type:"board",group_by:{property_id:"SECRET_PROPERTY",type:"status"},
   properties:[{property_id:"private-id",visible:true}]},
 created_by:{email:"PRIVATE_EMAIL"},token:"BEARER_PRIVATE"};
test("view metadata includes only counts and flags, not provider filter values",()=>{
 const metadata=project(view,{viewId:VIEW,sourceKind:"database",resourceId:DB});
 assert.equal(metadata.sourceId,DS);
 assert.equal(metadata.type,"board");
 assert.equal(metadata.hasFilter,true);
 assert.equal(metadata.sortCount,1);
 assert.equal(metadata.quickFilterCount,1);
 assert.equal(metadata.hasGrouping,true);
 for(const secret of ["SECRET","PRIVATE_EMAIL","BEARER_PRIVATE","private-id"]) {
   assert.equal(JSON.stringify(metadata).includes(secret),false,secret);
 }
});
test("linked view has two scopes: container and source",()=>{
 assert.equal(project(view,{viewId:VIEW,sourceKind:"data_source",resourceId:DS}).id,VIEW);
 assert.throws(()=>project(view,{viewId:VIEW,sourceKind:"database",resourceId:OTHER}),
   {code:"NOTION_VIEW_SCOPE_MISMATCH"});
 assert.throws(()=>project(view,{viewId:VIEW,sourceKind:"data_source",resourceId:OTHER}),
   {code:"NOTION_VIEW_SCOPE_MISMATCH"});
 assert.throws(()=>project({...view,id:OTHER},{viewId:VIEW,sourceKind:"database",
   resourceId:DB}),{code:"NOTION_VIEW_SCOPE_MISMATCH"});
});
test("missing parent/source and invalid layouts fail closed",()=>{
 for(const malformed of [{...view,parent:null},
  {...view,data_source_id:"../../../"},
  {...view,type:"iframe"},
  {...view,parent:{type:"page_id",page_id:OTHER}},
  {...view,data_source_id:null}]){
   assert.throws(()=>project(malformed,{viewId:VIEW,sourceKind:"database",resourceId:DB}),
     {code:"NOTION_VIEW_SCOPE_MISMATCH"});
 }
});
test("dashboard can have null source only when scoped to database",()=>{
 const dashboard={...view,type:"dashboard",data_source_id:null,configuration:null};
 assert.equal(project(dashboard,{viewId:VIEW,sourceKind:"database",resourceId:DB}).sourceId,null);
 assert.throws(()=>project(dashboard,{viewId:VIEW,sourceKind:"data_source",resourceId:DS}));
});
