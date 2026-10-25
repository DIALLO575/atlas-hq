import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync(new URL("../src/components/notion-resources-client.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../src/app/api/apps/notion/read/route.ts",import.meta.url),"utf8");
test("Notion document UI loads more only on explicit action",()=>{
  assert.match(client,/async function moreDocument\(\)/);
  assert.match(client,/onClick=\{\(\)=>void moreDocument\(\)\}/);
  assert.match(client,/cursor:documentCursor/);
  assert.match(client,/data\.nextCursor!==documentCursor/);
});
test("Notion rich text UI uses React native escaping, never HTML injection",()=>{
  assert.match(client,/function NotionRichText/);
  assert.match(client,/block\.segments\?\?\[\]/);
  assert.doesNotMatch(client,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
test("Notion page continuation preserves earlier truncation state",()=>{
  assert.match(client,/setDocumentPartial\(previous=>previous \|\| data\.truncated===true\)/);
  assert.match(client,/seen\.add\(block\.id\)/);
});
test("document read route uses scoped bearer and bounded traversal",()=>{
  assert.match(route,/loadNotionPersonalConnection/);
  assert.match(route,/collectNotionDocument\(client, resourceId/);
  assert.match(route,/maxDepth: 2, maxNodes: 35, maxRequests: 7, pageSize: 25/);
  assert.match(route,/startCursor: cursor/);
});
