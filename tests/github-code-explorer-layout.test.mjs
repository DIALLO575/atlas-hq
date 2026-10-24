import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PR inspector opens one selected patch in a dedicated code pane", async () => {
  const ui = await read("../src/components/github-control-center.tsx");
  assert.match(ui, /className="atlas-gh-code-explorer"/);
  assert.match(ui, /className="atlas-gh-file-browser"/);
  assert.match(ui, /className="atlas-gh-code-pane"/);
  assert.match(ui, /detail\.files\.filter\(\(file\) => file\.path === expandedFile\)/);
  assert.match(ui, /setExpandedFile\(result\.files\.find\(\(file\) => file\.patch\)\?\.path/);
  assert.match(ui, /detail\.files\.slice\(0, visibleFileCount\)/);
  assert.match(ui, /aria-expanded=\{expandedFile === file\.path\}/);
  assert.match(ui, /file\.patch\.split\("\\n"\)\.map/);
});

test("diff navigation is bounded and responsive without empty parallel columns", async () => {
  const css = await read("../src/app/github-control-center.css");
  assert.match(css, /\.atlas-gh-content-v2\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.atlas-gh-code-explorer\s*\{\s*display:\s*grid/);
  assert.match(css, /\.atlas-gh-code-explorer \.atlas-gh-files\s*\{[\s\S]*?max-height:\s*min\(57vh, 500px\)/);
  assert.match(css, /\.atlas-gh-code-explorer \.atlas-gh-file > \.atlas-gh-file-icon/);
  assert.match(css, /@media \(max-width: 800px\)/);
});
