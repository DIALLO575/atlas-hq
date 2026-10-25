import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../src/app/api/apps/notion/read/route.ts",import.meta.url),"utf8");
test("Notion read maps provider input failure to sanitized 502, not browser input 400",()=>{
 assert.match(route,/error\.code === "INVALID_INPUT" \? 400/);
 assert.match(route,/return json\(\{ error: "notion-" \+ error\.code/);
 assert.match(route,/: 502;/);
 assert.doesNotMatch(route,/error\.message|response\.text\(\)/);
});
