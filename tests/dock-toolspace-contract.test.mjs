import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dock stays compact and never opens a second toolspace panel", async () => {
  const [shell, styles] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/app/dock-studio.css"),
  ]);
  assert.match(shell, /className="atlas-dock atlas-smart-dock"/);
  assert.match(shell, /Navigation principale/);
  assert.match(shell, /aria-label="Agrandir le menu"|aria-label=\{expanded \? "Réduire le menu" : "Agrandir le menu"\}/);
  assert.doesNotMatch(shell, /DockToolspace|toolspaceOpen|atlas-tools-open|atlas-dock-pins|Outils & agents|onTogglePin/);
  assert.doesNotMatch(styles, /\.atlas-toolspace|atlas-tools-open|atlas-dock-tool-toggle|atlas-dock-pins/);
});

test("dock keeps direct access to agents, apps, Chief and approvals", async () => {
  const shell = await read("../src/components/app-shell.tsx");
  for (const href of ["/", "/agents", "/apps", "/missions", "/inbox", "/chief", "/workspaces"]) {
    assert.ok(shell.includes('href: "' + href + '"'));
  }
  assert.match(shell, /aria-current=\{pathname === item\.href \? "page"/);
  assert.match(shell, /onClick=\{closeMenu\}/);
  assert.match(shell, /<SessionControls \/>/);
});
