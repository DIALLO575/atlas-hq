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

test("last pass: portrait tablets receive full-screen Notion UI and keyboard-safe viewport",()=>{
 assert.match(ui,/matchMedia\("\(max-width:840px\)"\)/);
 assert.match(css,/@media \(max-width:840px\)/);
 assert.doesNotMatch(css,/max-width:760px/);
 assert.match(css,/scroll-padding-top:calc\(82px/);
 assert.match(css,/scroll-padding-bottom:calc\(94px/);
 assert.match(css,/:has\(input:focus, textarea:focus, \[contenteditable="true"\]:focus\)/);
});
test("last pass: Notion phone tabs announce screen and point to real controlled panes",()=>{
 assert.match(ui,/<strong aria-live="polite">\{mobileScreen/);
 for(const target of ["library","stage","inspector"]){
   assert.match(ui,new RegExp('id=\\{"nt-'+target+'-"\\+connectionId\\}'));
   assert.match(ui,new RegExp('aria-controls=\\{"nt-'+target+'-"\\+connectionId\\}'));
 }
 assert.match(ui,/nt-stage-no-views/);
 assert.match(css,/\.nt-phone-views \.nt-stage-no-views \.nt-stage-title\{display:none\}/);
});
test("last pass: subdued Notion text has >=4.5:1 contrast on warm gray",()=>{
 const luminance=(hex)=>{
   const n=[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16)/255);
   const linear=n.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
   return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 };
 const contrast=(a,b)=>{
   const x=luminance(a),y=luminance(b);
   return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
 };
 assert.ok(contrast("#696862","#f1f1ef")>=4.5);
 assert.match(css,/--nt-muted:#696862/);
 assert.doesNotMatch(css,/#787774/);
});
