import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui=readFileSync(new URL("../../../../src/components/notion-resources-client.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../../../../src/app/api/apps/notion/data/route.ts",import.meta.url),"utf8");
test("source selection explicitly distinguishes database and data_source",()=>{
 assert.match(ui,/item\.kind === "database"/);
 assert.match(ui,/mode:"discover"/);
 assert.match(ui,/mode:"rows"/);
 assert.match(ui,/await loadSourceRows\(sources\[0\]\.id\)/);
 assert.match(ui,/setActiveSourceId\(id\)/);
 assert.match(ui,/sourceRefs\.map/);
});
test("source continuation is manual, cursor-bound and duplicate-free",()=>{
 assert.match(ui,/async function moreSourceRows\(\)/);
 assert.match(ui,/cursor:current/);
 assert.match(ui,/onClick=\{\(\)=>void moreSourceRows\(\)\}/);
 assert.match(ui,/seen\.add\(row\.id\)/);
 assert.match(ui,/data\.nextCursor!==current/);
});
test("preview uses accessible table and safe React text nodes without HTML",()=>{
 assert.match(ui,/role="region" tabIndex=\{0\}/);
 assert.match(ui,/<table className="nt-source-table">/);
 assert.match(ui,/<th scope="col" key=\{column\.key\}>/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
test("schema/row routes keep workspace actor gates and 12-row cap",()=>{
 assert.match(route,/loadNotionPersonalConnection/);
 assert.match(route,/refreshNotionPersonalConnection/);
 assert.match(route,/maxRows:12/);
 assert.match(route,/getDataSource\(resourceId\)/);
 assert.match(route,/getDatabase\(resourceId\)/);
 assert.match(route,/queryDataSource\(resourceId/);
});
