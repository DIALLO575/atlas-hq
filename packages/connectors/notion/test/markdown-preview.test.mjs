import test from "node:test";
import assert from "node:assert/strict";
import {projectNotionMarkdown} from "../src/markdown-preview.mjs";
const ID="123e4567-e89b-12d3-a456-426614174000";
const OTHER="223e4567-e89b-12d3-a456-426614174000";
const BASE={object:"page_markdown",id:ID,markdown:"# Hello",truncated:false,unknown_block_ids:[]};
test("notion signed links and any raw URLs must never enter the preview",()=>{
 const sig="X-Amz-Signature=TOP_SECRET";
 const input={...BASE,markdown:"# Plan\n![Cat](https://s3.amazonaws.com/f.png?"+sig+")\n"+
  "[Image](https://files.notion.so/f?"+sig+")\n"+
  "See https://notion.so/f?"+sig+"\n"+
  '<file src="https://evil.test?'+sig+'">caption</file>'};
 const result=projectNotionMarkdown(input,ID),output=JSON.stringify(result);
 assert.equal(output.includes("TOP_SECRET"),false);
 assert.equal(output.includes("files.notion.so"),false);
 assert.equal(output.includes("evil.test"),false);
 assert.equal(result.lossy,true);
 assert.equal(result.mediaLinksSuppressed,true);
});
test("provider unknown ids never leave the server",()=>{
 const result=projectNotionMarkdown({...BASE,truncated:true,unknown_block_ids:[OTHER]},ID);
 assert.equal(result.unknownCount,1);
 assert.equal(result.truncated,true);
 assert.equal(JSON.stringify(result).includes(OTHER),false);
});
test("very long Markdown is bounded and marked incomplete",()=>{
 const result=projectNotionMarkdown({...BASE,
   markdown:Array.from({length:170},(_,i)=>"- item "+i).join("\n")},ID);
 assert.equal(result.lines.length,100);
 assert.equal(result.truncated,true);
});
test("safe headings, tasks, quotes and fenced code classify without HTML",()=>{
 const result=projectNotionMarkdown({...BASE,
   markdown:"# Heading\n> Quote\n- [x] Task\n~~~js\nconsole.log('a')\n~~~\n<b onclick='evil()'>bad</b>"},ID);
 assert.equal(result.lines[0].kind,"heading");
 assert.equal(result.lines[1].kind,"quote");
 assert.equal(result.lines[2].kind,"task");
 assert.equal(result.lines[4].kind,"code");
 assert.equal(JSON.stringify(result).includes("onclick"),false);
});
test("reject malformed, swapped and too-large provider responses",()=>{
 for(const raw of [{...BASE,id:OTHER},{...BASE,markdown:42},
   {...BASE,truncated:"no"},{...BASE,unknown_block_ids:["bad"]},
   {...BASE,markdown:"x".repeat(64001)}]){
   assert.throws(()=>projectNotionMarkdown(raw,ID),{code:"NOTION_MARKDOWN_INVALID_RESPONSE"});
 }
});
