import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const route=readFileSync(new URL("../../../../src/app/api/apps/notion/data/route.ts",
  import.meta.url),"utf8");
test("database source route binds Notion actor and refuses arbitrary filters/URLs",()=>{
 assert.match(route,/loadNotionPersonalConnection/);
 assert.match(route,/refreshNotionPersonalConnection/);
 assert.match(route,/params\.has\("url"\)/);
 assert.match(route,/params\.has\("filter"\)/);
 assert.match(route,/params\.has\("sorts"\)/);
 assert.match(route,/!UUID\.test\(resourceId\)/);
});
test("schema/rows are projected and paginated; no upstream JSON proxy",()=>{
 assert.match(route,/projectNotionDatabaseSources/);
 assert.match(route,/projectNotionDataSourceSchema/);
 assert.match(route,/projectNotionDataSourceRows/);
 assert.match(route,/queryDataSource\(resourceId/);
 assert.match(route,/size: 12/);
 assert.match(route,/Cache-Control": "private, no-store"/);
});
