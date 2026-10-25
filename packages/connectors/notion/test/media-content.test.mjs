import test from "node:test";
import assert from "node:assert/strict";
import { projectNotionBlock, safeExternalUrl, safeNotionHostedUrl,
  collectNotionDocument } from "../src/media-content.mjs";
const ID="123e4567-e89b-12d3-a456-426614174000";
const ID2="223e4567-e89b-12d3-a456-426614174000";
const ID3="323e4567-e89b-12d3-a456-426614174000";
const NOW=1792920000000;
const URL="https://s3.us-west-2.amazonaws.com/secure.notion-static.com/asset.png?X-Amz=secret";
const EXP="2026-10-26T10:00:00.000Z";
const mk=(id,type,body,has_children=false)=>({object:"block",id,type,
  [type]:body,has_children,access_token:"MUST_NOT_EXPOSE"});
test("hosted Notion media project as scoped proxy descriptor, never signed URL",()=>{
  const res=projectNotionBlock(mk(ID,"image",{type:"file",
    file:{url:URL,expiry_time:EXP},caption:[{plain_text:"Photo"}]}),{now:NOW});
  assert.deepEqual(res.media,{kind:"image",origin:"notion",mode:"proxy",
    caption:"Photo",filename:"",href:null});
  assert.equal(JSON.stringify(res).includes("secret"),false);
  assert.equal(JSON.stringify(res).includes("MUST_NOT_EXPOSE"),false);
});
test("media metadata covers image, file, pdf, audio, video and external links",()=>{
  for(const kind of ["image","file","pdf","audio","video"]){
    const res=projectNotionBlock(mk(ID,kind,{type:"external",
      external:{url:"https://example.org/test"},name:"a"}));
    assert.equal(res.media.kind,kind);
    assert.equal(res.media.mode,"link");
    assert.equal(res.media.href,"https://example.org/test");
  }
});
test("opaque file_upload never invents a resolved URL",()=>{
  const res=projectNotionBlock(mk(ID,"file",{type:"file_upload",
    file_upload:{id:ID2}}));
  assert.equal(res.media.mode,"unavailable");
  assert.equal(res.media.href,null);
});
test("rejects arbitrary hosts, redirects and expired signed file URLs",()=>{
  for(const url of ["https://evil.test/","http://files.notion.so/xx",
    "https://files.notion.so.attacker.org/xx",
    "https://s3.us-west-2.amazonaws.com/attacker.bucket/file",
    "https://u:p@files.notion.so/data"])assert.equal(safeNotionHostedUrl(url,EXP,NOW),null);
  assert.equal(safeNotionHostedUrl(URL,"2026-10-25T09:00:00Z",NOW),null);
  assert.ok(safeNotionHostedUrl(URL,EXP,NOW));
});
test("external URLs are HTTPS only and not local or credentialed",()=>{
  for(const v of ["javascript:alert(1)","http://example.org","https://127.0.0.1/test",
    "https://localhost/","https://u:p@site.org","https://site.org:8443/path"])
    assert.equal(safeExternalUrl(v),null);
  assert.equal(safeExternalUrl("https://example.org/doc.pdf"),"https://example.org/doc.pdf");
});
test("rich text, table cells, child pages and annotation are bounded and sanitized",()=>{
  const paragraph=projectNotionBlock(mk(ID,"paragraph",{rich_text:[
    {plain_text:"A",rich_text:{private:"SECRET"}},
    {plain_text:"B"}]}));
  assert.equal(paragraph.text,"AB");
  assert.equal(JSON.stringify(paragraph).includes("SECRET"),false);
  const row=projectNotionBlock(mk(ID,"table_row",{cells:[
    [{plain_text:"one"}],[{plain_text:"two"}]]}));
  assert.deepEqual(row.cells,["one","two"]);
  const child=projectNotionBlock(mk(ID,"child_page",{title:"Project"}));
  assert.equal(child.text,"Project");
});
test("unrecognized blocks are harmless placeholders",()=>{
  const block=projectNotionBlock(mk(ID,"scary_html",{html:"<script>hacked</script>"}));
  assert.equal(block.type,"unsupported");
  assert.equal(JSON.stringify(block).includes("script"),false);
  assert.equal(projectNotionBlock({object:"block",id:"not-uuid",type:"image"}),null);
});
test("nested document traversal is bounded and excludes linked child pages",async()=>{
  const calls=[];
  const client={async listBlockChildren(id){calls.push(id);return id===ID?
    {results:[mk(ID2,"toggle",{rich_text:[{plain_text:"Details"}]},true),
      mk(ID3,"child_page",{title:"Hidden child"},true)],
      has_more:false,next_cursor:null}:
    {results:[mk("423e4567-e89b-12d3-a456-426614174000","paragraph",
      {rich_text:[{plain_text:"Nested"}]})],has_more:false,next_cursor:null};
  }};
  const doc=await collectNotionDocument(client,ID,{maxDepth:2,maxNodes:8,maxRequests:4});
  assert.equal(doc.blocks.length,2);
  assert.equal(doc.blocks[0].children[0].text,"Nested");
  assert.deepEqual(calls,[ID,ID2]);
  assert.equal(doc.truncated,true); // non-traversed child page
});
test("strict node/request limits prevent recursive provider crawl",async()=>{
  const calls=[];
  const client={async listBlockChildren(id){calls.push(id);return {
    results:[mk(ID2,"toggle",{},true)],has_more:true,next_cursor:"next"};
  }};
  const doc=await collectNotionDocument(client,ID,{maxNodes:1,maxRequests:1});
  assert.equal(doc.nodes,1);assert.equal(doc.requests,1);assert.equal(doc.truncated,true);
  assert.equal(calls.length,1);
  await assert.rejects(collectNotionDocument(client,ID,{maxNodes:100}));
});
test("one malformed provider list fails closed without exposing payload",async()=>{
  const client={async listBlockChildren(){return {bad:"secret"}}};
  await assert.rejects(collectNotionDocument(client,ID),/NOTION_INVALID_RESPONSE/);
});
