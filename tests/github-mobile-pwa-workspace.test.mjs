import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("phone PWA has a dedicated six-destination thumb dock and a route back to Atlas", async () => {
  const view = await read("../src/components/github-control-center.tsx");
  const css = await read("../src/app/github-mobile-workspace.css");
  assert.match(view, /atlas-gh-mobile-dock/);
  assert.match(view, /aria-label="Navigation GitHub mobile"/);
  assert.match(view, /sections\.map\(\(item\) => <button type="button" key=\{item\.id\}/);
  assert.match(view, /item\.id === "actions" \? "Actions" : "Plus"/);
  assert.match(view, /href="\/apps" className="atlas-gh-mobile-atlas-back"/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /\.atlas-gh-console \.atlas-gh-tabs\{display:none!important\}/);
  assert.match(css, /position:fixed!important/);
  assert.match(css, /height:100dvh/);
});

test("PR list and diff are different phone screens with a real back button", async () => {
  const view = await read("../src/components/github-control-center.tsx");
  const css = await read("../src/app/github-mobile-workspace.css");
  assert.match(view, /const \[mobilePRDetail, setMobilePRDetail\] = useState\(false\)/);
  assert.match(view, /setMobilePRDetail\(true\)/);
  assert.match(view, /setMobilePRDetail\(false\)/);
  assert.match(view, /is-mobile-pr-detail/);
  assert.match(view, /Retour aux Pull Requests/);
  assert.match(css, /\.is-mobile-pr-detail \.atlas-gh-primary\{display:none\}/);
  assert.match(css, /\.is-mobile-pr-detail \.atlas-gh-secondary\{display:block/);
  assert.match(css, /scroll-snap-type:x proximity/);
  assert.match(css, /\.atlas-gh-diff pre\{/);
  assert.match(css, /overflow-x:auto/);
});

test("CI runs and jobs use a phone drill-down without exposing write controls", async () => {
  const view = await read("../src/components/github-actions-control-center.tsx");
  const css = await read("../src/app/github-mobile-workspace.css");
  assert.match(view, /const \[mobileRunDetail,setMobileRunDetail\]\s*=\s*useState\(false\)/);
  assert.match(view, /setMobileRunDetail\(true\)/);
  assert.match(view, /setMobileRunDetail\(false\)/);
  assert.match(view, /Retour aux workflows/);
  assert.match(view, /is-mobile-run-detail/);
  assert.match(css, /\.is-mobile-run-detail \.atlas-gh-actions-feed\{display:none\}/);
  assert.match(css, /\.is-mobile-run-detail \.atlas-gh-actions-inspector\{display:flex\}/);
  assert.doesNotMatch(view, /\/api\/apps\/github\/actions\/rerun|method:"POST"/);
});

test("PWA mobile has safe-area, keyboard, touch and reduced motion treatment", async () => {
  const css = await read("../src/app/github-mobile-workspace.css");
  const layout = await read("../src/app/layout.tsx");
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.match(css, /env\(safe-area-inset-top,0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom,0px\)/);
  assert.match(css, /min-height:49px/);
  assert.match(css, /touch-action:manipulation/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /:has\(input:focus\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(layout, /github-mobile-workspace\.css/);
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/apps/github"));
});

test("PWA navigation does not add GitHub mutations or weaken existing permissions", async () => {
  const page = await read("../src/components/github-control-center.tsx");
  const studio = await read("../src/components/github-studio-repository-wizard.tsx");
  const actions = await read("../src/components/github-actions-control-center.tsx");
  assert.match(page, /<GitHubStudioRepositoryWizard key=/);
  assert.match(page, /<GitHubActionsControlCenter key=/);
  assert.match(studio,/repositories\/execute/);
 assert.match(studio,/x-studio-approval/);
 assert.match(studio,/confirmed:true/);
  assert.doesNotMatch(actions, /\/rerun|method:"POST"/);
});
