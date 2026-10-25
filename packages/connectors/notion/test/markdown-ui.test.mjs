import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../../../../src/components/notion-resources-client.tsx",import.meta.url),"utf8");
test("Notion Markdown preview is manually triggered and text only",()=>{
 assert.match(s,/onClick=\{\(\)=>void showMarkdown\(\)\}/);
 assert.match(s,/setMarkdownPreview/);
 assert.match(s,/markdownPreview\?\.lines\.map/);
 assert.doesNotMatch(s,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
