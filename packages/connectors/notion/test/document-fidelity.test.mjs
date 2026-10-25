import test from "node:test";
import assert from "node:assert/strict";
import { projectNotionRichText, projectNotionBlock, collectNotionDocument }
  from "../src/media-content.mjs";
const ID="123e4567-e89b-12d3-a456-426614174000";
const ID2="223e4567-e89b-12d3-a456-426614174000";
const ID3="323e4567-e89b-12d3-a456-426614174000";
const page=(id,text)=>({object:"block",id,type:"paragraph",has_children:false,
  paragraph:{rich_text:[{type:"text",plain_text:text}]}});
test("rich spans preserve styling and links but never raw user identity",()=>{
  const spans=projectNotionRichText([
    {type:"text",plain_text:"Bonjour ",annotations:{bold:true},href:null,
      access_token:"NEVER",text:{content:"Bonjour ",link:null}},
    {type:"mention",plain_text:"@Personne",href:"https://www.notion.so/p/example",
      mention:{user:{email:"PRIVATE",name:"PRIVATE",id:ID}},annotations:{italic:true}},
    {type:"equation",equation:{expression:"E=mc^2"},annotations:{code:true}},
    {type:"text",plain_text:"BAD LINK",href:"javascript:alert(1)"},
  ]);
  assert.equal(spans.map(s=>s.text).join(""),"Bonjour @PersonneE=mc^2BAD LINK");
  assert.equal(spans[0].bold,true);
  assert.equal(spans[1].kind,"mention");
  assert.equal(spans[1].href,"https://www.notion.so/p/example");
  assert.equal(spans[2].kind,"equation");
  assert.equal(spans[3].href,null);
  assert.equal(JSON.stringify(spans).includes("PRIVATE"),false);
  assert.equal(JSON.stringify(spans).includes("NEVER"),false);
});
test("rich text total length and array size bounded",()=>{
  const spans=projectNotionRichText(Array.from({length:60},()=>({
    type:"text",plain_text:"x".repeat(120),
  })));
  assert.equal(spans.length<=30,true);
  assert.equal(spans.reduce((n,s)=>n+s.text.length,0),1400);
});
test("paragraph projector keeps safe segments and header settings",()=>{
  const block=projectNotionBlock({
    object:"block",id:ID,type:"paragraph",
    paragraph:{rich_text:[{type:"text",plain_text:"Salut",
      annotations:{bold:true},href:"https://example.org"}]},
  });
  assert.equal(block.segments[0].bold,true);
  assert.equal(block.segments[0].href,"https://example.org/");
  const table=projectNotionBlock({
    object:"block",id:ID2,type:"table",has_children:true,
    table:{table_width:2,has_column_header:true,has_row_header:true},
  });
  assert.deepEqual(table.tableHeaders,{column:true,row:true});
  assert.equal(table.childrenTruncated,true);
});
test("root cursor passed to Notion and hasMore signals manual continuation",async()=>{
  const calls=[];
  const client={async listBlockChildren(id,opt){
    calls.push({id,...opt});
    return opt.startCursor==="next"?
      {results:[page(ID3,"second")],has_more:false,next_cursor:null}:
      {results:[page(ID2,"first")],has_more:true,next_cursor:"next"};
  }};
  const first=await collectNotionDocument(client,ID,{maxDepth:0});
  assert.equal(first.blocks[0].text,"first");
  assert.equal(first.nextCursor,"next");
  assert.equal(first.hasMore,true);
  assert.equal(first.truncated,true);
  const second=await collectNotionDocument(client,ID,{maxDepth:0,startCursor:first.nextCursor});
  assert.equal(second.blocks[0].text,"second");
  assert.equal(second.hasMore,false);
  assert.equal(second.nextCursor,null);
  assert.deepEqual(calls.map(c=>c.startCursor),[null,"next"]);
});
test("nested pagination never disguises missing nested content as complete",async()=>{
  const client={async listBlockChildren(id,opt){
    return id===ID?
      {results:[{object:"block",id:ID2,type:"toggle",has_children:true,
        toggle:{rich_text:[{plain_text:"toggle"}]}}],
        has_more:false,next_cursor:null}:
      {results:[page(ID3,"child")],has_more:true,next_cursor:"more-nested"};
  }};
  const result=await collectNotionDocument(client,ID,{maxDepth:2,maxRequests:3});
  assert.equal(result.blocks[0].children[0].text,"child");
  assert.equal(result.blocks[0].childrenTruncated,true);
  assert.equal(result.truncated,true);
  assert.equal(result.hasMore,false); // only root cursor, never nested cursor
});
test("rejects malicious cursors before calling provider",async()=>{
  let calls=0;
  const client={async listBlockChildren(){calls++;return {
    results:[],has_more:false,next_cursor:null,
  }}};
  for(const startCursor of ["","a\nb","x".repeat(2049),42]){
    await assert.rejects(collectNotionDocument(client,ID,{startCursor}),
      {code:"INVALID_INPUT"});
  }
  assert.equal(calls,0);
});
test("manual pagination remains bounded and not a bulk Notion crawler",async()=>{
  let calls=0;
  const client={async listBlockChildren(){calls++;return {
    results:[page(ID2,"a")],has_more:true,next_cursor:"second-page",
  }}};
  const out=await collectNotionDocument(client,ID,{maxNodes:1,maxRequests:1});
  assert.equal(out.requests,1);
  assert.equal(out.hasMore,true);
  assert.equal(calls,1);
});
