import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../../../",import.meta.url);
const ui=readFileSync(new URL("src/components/notion-resources-client.tsx",root),"utf8");
const page=readFileSync(new URL("src/app/apps/notion/page.tsx",root),"utf8");
const css=readFileSync(new URL("src/app/apps/notion/notion-console.css",root),"utf8");
test("library filters only already-loaded resources with explicit selection",()=>{
 assert.match(ui,/resourceFilters\.map\(filter=>/);
 assert.match(ui,/resources\.filter\(item=>resourceFilter===/);
 assert.match(ui,/aria-pressed=\{resourceFilter===filter\.id\}/);
 assert.match(ui,/visibleResources\.map\(item/);
 assert.doesNotMatch(ui,/const mockResources|const demoResources|fakeNotionData/i);
});
test("document and Markdown are separate explicit reader modes",()=>{
 assert.match(ui,/documentMode==="markdown"/);
 assert.match(ui,/documentMode==="document"/);
 assert.match(ui,/onClick=\{\(\)=>void showMarkdown\(\)\}/);
 assert.match(ui,/onClick=\{\(\)=>setDocumentMode\("document"\)\}/);
 assert.match(ui,/if\(markdownPreview\)return/);
 assert.match(ui,/setDocumentMode\("document"\); setBlocks/);
});
test("media cards use actor-proxy block IDs, not provider URLs",()=>{
 assert.match(ui,/blockId:block\.id/);
 assert.match(ui,/new URLSearchParams/);
 assert.match(ui,/nt-media-header/);
 assert.match(ui,/media\.mode==="proxy"/);
 assert.match(ui,/media\.mode==="link" && media\.href/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
test("partial content warns explicitly and pagination remains manual",()=>{
 assert.match(ui,/nt-stat-limited/);
 assert.match(ui,/nt-preview-caution/);
 assert.match(ui,/async function moreDocument\(\)/);
 assert.match(ui,/async function moreSourceRows\(\)/);
 assert.match(ui,/nt-table-scroll-hint/);
 assert.match(ui,/sourceLimited/);
});
test("native views remain scoped and do not impersonate full Kanban",()=>{
 assert.match(ui,/sourceKind:scope\.kind,resourceId:scope\.id/);
 assert.match(ui,/metadata\.hasFilter/);
 assert.match(ui,/metadata\.sortCount/);
 assert.match(ui,/ATLAS ne reproduit ni la mise en page complète/);
});
test("unconnected state links to setup and never invents user resources",()=>{
 assert.match(page,/authorized\.length > 0 \? <NotionResourcesClient/);
 assert.match(page,/Connectez Notion pour retrouver vos pages et vos bases/);
 assert.doesNotMatch(page,/demoResources|mockResources/);
 assert.match(page,/href="#notion-connections"/);
 assert.match(page,/id="notion-connections"/);
 assert.match(page,/!configured/);
});
test("mobile, scrolling, focus and motion-reduction rules are present",()=>{
 for(const name of ["nt-document-tab","nt-rich-media","nt-source-table-scroll",
   "nt-resource-filters","nt-view-tile","nt-page-reader-head"]){
   assert.ok(css.includes("."+name),name);
 }
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow:auto/);
});
