import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("GitHub Studio wizard verifies preview without executing a repository write", async () => {
  const ui = await read("../src/components/github-studio-repository-wizard.tsx");
  const page = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /fetch\("\/api\/apps\/github\/studio\/repositories\/preview"/);
  assert.match(ui, /credentials:\s*"same-origin"/);
  assert.match(ui, /method:\s*"POST"/);
  assert.match(ui, /data\?\.canExecute\s*!==\s*false/);
  assert.match(ui, /Le dépôt n'a pas été créé/);
  assert.match(ui, /Création GitHub désactivée/);
  assert.doesNotMatch(ui, /\/api\/apps\/github\/studio\/repositories\/execute/);
  assert.match(page, /id: "studio"/);
  assert.match(page, /<GitHubStudioRepositoryWizard/);
  assert.match(page, /section !== "settings" && section !== "studio"/);
});

test("GitHub Studio split workspace is responsive and blocks disabled approval", async () => {
  const css = await read("../src/app/github-control-center.css");
  assert.match(css, /\.atlas-gh-studio-layout\s*\{display:grid;/);
  assert.match(css, /@media\(max-width:790px\)/);
  assert.match(css, /\.atlas-gh-studio-form button:disabled/);
  assert.match(css, /\.atlas-gh-studio-approve:disabled/);
});
