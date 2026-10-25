import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/components/notion-resources-client.tsx");
const page=read("src/app/apps/notion/page.tsx");
const css=read("src/app/apps/notion/notion-mobile-workspace.css");
const manifest=JSON.parse(read("public/manifest.webmanifest"));

test("Notion route has its own appbar, Atlas exit and local CSS, no new global PWA",()=>{
 assert.match(page,/className="nt-phone-appbar"/);
 assert.match(page,/href="\/apps" className="nt-phone-atlas-back"/);
 assert.match(page,/href="#notion-connections"/);
 assert.match(page,/notion-mobile-workspace\.css/);
 assert.match(css,/\.nt-page\s*\{/);
 assert.match(css,/\.nt-page \.nt-phone-appbar/);
 assert.equal(manifest.display,"standalone");
});
test("Notion native phone UI has four working touch navigation screens",()=>{
 assert.match(ui,/type NotionPhoneScreen="library"\|"reader"\|"views"\|"access"/);
 assert.match(ui,/const \[mobileScreen,setMobileScreen\]=useState<NotionPhoneScreen>\("library"\)/);
 assert.match(ui,/aria-label="Navigation Notion mobile"/);
 for(const screen of ["library","reader","views","access"]){
   assert.match(ui,new RegExp('navigateMobile\\("'+screen+'"\\)'));
   assert.match(css,new RegExp('nt-phone-'+screen));
 }
 assert.match(ui,/setSelected\(item\);navigateMobile\("reader"\)/);
 assert.match(ui,/setCurrentView\(item\);navigateMobile\("views"\)/);
 assert.match(ui,/id="notion-explorer"/);
 assert.match(ui,/scrollIntoView/);
});
test("phone UI has a real fullscreen workspace with safe-area and keyboard controls",()=>{
 assert.match(css, /position:fixed!important;inset:0!important/);
 assert.match(css, /height:100dvh/);
 assert.match(css, /env\(safe-area-inset-top,0px\)/);
 assert.match(css, /env\(safe-area-inset-bottom,0px\)/);
 assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css, /min-height:50px/);
 assert.match(css, /font-size:16px/);
 assert.match(css, /:has\(input:focus\)/);
 assert.match(css, /@media \(max-width:390px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /:focus-visible/);
});
test("Notion palette is scoped to Notion not GitHub, ATLAS or global manifest",()=>{
 assert.match(css,/--nt-ink:#191919/);
 assert.match(css,/--nt-soft:#f7f7f5/);
 assert.match(css,/background:#191919/);
 assert.match(css,/background:#fff/);
 assert.doesNotMatch(css,/\.atlas-gh-console|\.atlas-shell\s+\*:not/);
 assert.ok(manifest.shortcuts.some(x=>x.url==="/apps/github"));
});
test("source and native view screens do not fake unknown Notion data",()=>{
 assert.match(ui,/nt-phone-views-empty/);
 assert.match(ui,/selected.kind==="page"/);
 assert.match(css,/\.nt-phone-reader \.nt-stage/);
 assert.match(css,/\.nt-phone-views \.nt-view-content/);
 assert.match(css,/\.nt-phone-views \.nt-sources\{display:none\}/);
 assert.match(ui,/metadata\.hasFilter/);
 assert.match(ui,/NotionCapabilitiesClient/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|demoNotionData|mockNotionData/);
});
test("permissions and OAuth remain unchanged while app navigation remains keyboard accessible",()=>{
 assert.match(page,/const configured = Boolean\(settings\?\.callbackEnabled && notionTokenVault\(\)\)/);
 assert.match(ui,/loadNotionPersonalConnection|NotionCapabilitiesClient/);
 assert.match(ui,/aria-current=\{mobileScreen/);
 assert.match(ui,/nt-phone-manage-link/);
 assert.match(ui,/aria-label="Retour à Mes Apps ATLAS"|Navigation Notion mobile/);
});
