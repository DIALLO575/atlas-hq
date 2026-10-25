import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
test("Studio wizard supports preview, OAuth and explicit approved creation",async()=>{
 const ui=await read("../src/components/github-studio-repository-wizard.tsx");
 const page=await read("../src/components/github-control-center.tsx");
 assert.match(ui,/fetch\("\/api\/apps\/github\/studio\/repositories\/preview"/);
 assert.match(ui,/credentials:\s*"same-origin"/);
 assert.match(ui,/method:\s*"POST"/);
 assert.match(ui,/data\?\.canExecute\s*!==\s*false/);
 assert.match(ui,/executionEnabled/);
 assert.match(ui,/Création non activée dans cet environnement/);
 assert.match(ui,/\/api\/apps\/github\/studio\/repositories\/execute/);
 assert.match(ui,/studio\/oauth\/start/);
 assert.match(page,/id: "studio"/);
 assert.match(page,/<GitHubStudioRepositoryWizard/);
 assert.match(page,/section === "repositories" \|\| section === "pulls"/);
});
test("Studio remains responsive with disabled submit and explicit human approval",async()=>{
 const css=await read("../src/app/github-control-center.css");
 assert.match(css,/\.atlas-gh-studio-layout\s*\{display:grid;/);
 assert.match(css,/@media\(max-width:790px\)/);
 assert.match(css,/\.atlas-gh-studio-form button:disabled/);
});
