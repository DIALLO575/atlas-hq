import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dock toolspace is a separate accessible launcher with agent view", async () => {
  const [shell, panel, registry] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/dock-toolspace.tsx"),
    read("../src/lib/dock-tools.ts"),
  ]);
  assert.match(shell, /<DockToolspace/);
  assert.match(shell, /aria-controls="atlas-dock-toolspace"/);
  assert.match(shell, /Ouvrir l'espace d'outils/);
  assert.match(shell, /atlas-dock-identity/);
  assert.match(panel, /id="atlas-dock-toolspace"/);
  assert.match(panel, /aria-pressed=\{tab === "tools"\}/);
  assert.match(panel, /aria-pressed=\{tab === "agents"\}/);
  assert.match(panel, /onTogglePin\(tool\.id\)/);
  assert.match(registry, /MAX_PINNED_TOOLS = 3/);
  assert.match(registry, /GitHub/);
  assert.match(panel, /Outil disponible/);
});

test("a dock shortcut never executes an external agent tool or claims it is connected", async () => {
  const [panel, registry] = await Promise.all([
    read("../src/components/dock-toolspace.tsx"),
    read("../src/lib/dock-tools.ts"),
  ]);
  assert.match(panel, /ne déclenchent pas d’action extérieure/);
  assert.match(panel, /L’exécution des outils par des agents n’est pas encore active/);
  assert.match(panel, /Aucune permission n’est accordée/);
  assert.match(registry, /does not grant agents permission/);
  assert.doesNotMatch(panel, /fetch\(|dangerouslySetInnerHTML|eval\(/);
});

test("pin preferences use validated local IDs and have a bounded length", async () => {
  const shell = await read("../src/components/app-shell.tsx");
  assert.match(shell, /atlas:dock-pins-v1/);
  assert.match(shell, /typeof id === "string" && dockTools\.some/);
  assert.match(shell, /\.slice\(0, MAX_PINNED_TOOLS\)/);
  assert.match(shell, /setPinnedIds\(\(current\) =>/);
  assert.match(shell, /aria-label=\{"Outil rapide:|aria-label=\{"Outil rapide : "/);
});
