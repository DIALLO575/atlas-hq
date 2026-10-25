import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path=new URL("../../../../src/app/api/apps/notion/read/route.ts",import.meta.url);
const s=readFileSync(path,"utf8");
test("Markdown route remains actor-bound and returns only projected preview",()=>{
 assert.match(s,/loadNotionPersonalConnection/);
 assert.match(s,/projectNotionMarkdown\(await client\.getPageMarkdown\(resourceId\),resourceId\)/);
 assert.match(s,/kind === "markdown" && \(cursor !== null \|\| query !== ""\)/);
 assert.match(s,/MARKDOWN_TOO_LARGE/);
});
