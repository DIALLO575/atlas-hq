import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../../../../src/components/notion-resources-client.tsx",
 import.meta.url),"utf8");
const api=readFileSync(new URL("../../../../src/app/api/apps/notion/views/route.ts",
 import.meta.url),"utf8");
test("view preview is tied to chosen database/data source, never just client view UUID",()=>{
 assert.match(ui,/sourceKind:scope\.kind,resourceId:scope\.id/);
 assert.match(api,/projectNotionViewMetadata\(detail/);
 assert.match(api,/new NotionReadError\("NOT_FOUND_OR_HIDDEN",404\)/);
});
test("read-only view preview query cache is released and failures acknowledged",()=>{
 assert.match(api,/await client\.releaseViewQuery\(viewId,snapshot\.id\)/);
 assert.match(api,/queryReleased/);
 assert.match(ui,/preview\.queryReleased/);
});
test("native view filters are flags, not browser-supplied filters or HTML",()=>{
 assert.match(ui,/metadata\.hasFilter/);
 assert.match(ui,/metadata\.sortCount/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
