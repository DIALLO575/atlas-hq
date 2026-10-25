import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("GitHub has six separately navigable workspace sections", async () => {
 const page = await read("../src/components/github-control-center.tsx");
 for (const name of [
  'id: "overview"', 'id: "repositories"', 'id: "pulls"',
  'id: "studio"', 'id: "actions"', 'id: "settings"',
 ]) assert.ok(page.includes(name), "Missing section "+name);
 assert.match(page, /atlas-gh-workbench/);
 assert.match(page, /atlas-gh-nav-copy/);
 assert.match(page, /section === "overview"/);
 assert.match(page, /section === "repositories" \|\| section === "pulls"/);
 assert.match(page, /section === "pulls" && <aside/);
 assert.match(page, /atlas-gh-repositories-only/);
});
test("dashboard is a real independent landing view, not the PR inspector", async () => {
 const page = await read("../src/components/github-control-center.tsx");
 assert.match(page,/atlas-gh-overview-welcome/);
 assert.match(page,/atlas-gh-overview-grid/);
 assert.match(page,/atlas-gh-overview-activity/);
 assert.match(page,/summary\.map/);
 assert.match(page,/pulls\.slice\(0,4\)/);
 assert.match(page,/setSection\("studio"\)|id:"studio"/);
});
test("focus mode fills viewport, restores scrolling and exits on Escape", async () => {
 const page = await read("../src/components/github-control-center.tsx");
 const css = await read("../src/app/github-command-deck.css");
 assert.match(page,/const \[focusMode, setFocusMode\] = useState\(false\)/);
 assert.match(page,/document\.body\.style\.overflow = "hidden"/);
 assert.match(page,/document\.body\.style\.overflow = oldOverflow/);
 assert.match(page,/event\.key === "Escape"/);
 assert.match(page,/window\.removeEventListener\("keydown", closeOnEscape\)/);
 assert.match(page,/aria-pressed=\{focusMode\}/);
 assert.match(css,/\.atlas-gh-console\.is-focus\{position:fixed;inset:0/);
 assert.match(css,/height:100dvh/);
});
test("GitHub styling is scoped, headers compact and responsive", async () => {
 const css = await read("../src/app/github-command-deck.css");
 const layout = await read("../src/app/layout.tsx");
 assert.match(css,/\.atlas-gh-console\{/);
 assert.match(css,/#0d1117/);
 assert.match(css,/#238636/);
 assert.match(css,/#0969da/);
 assert.match(css,/\.atlas-gh-console \.atlas-gh-identity h1\{font-size:19px!important/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(layout,/import "\.\/github-command-deck\.css"/);
});
test("Studio and Actions remain separate and neither enables production mutations", async()=>{
 const page = await read("../src/components/github-control-center.tsx");
 const studio = await read("../src/components/github-studio-repository-wizard.tsx");
 const actions = await read("../src/components/github-actions-control-center.tsx");
 assert.match(page,/<GitHubStudioRepositoryWizard key=/);
 assert.match(page,/<GitHubActionsControlCenter key=/);
 assert.match(studio,/repositories\/execute/);
 assert.match(studio,/x-studio-approval/);
 assert.match(studio,/confirmed:true/);
 assert.match(actions,/Confirmer la relance/);
});
