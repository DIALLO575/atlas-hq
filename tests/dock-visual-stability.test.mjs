import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dock uses a quiet white surface without the crowded toolspace overlay", async () => {
  const css = await read("../src/app/dock-studio.css");
  assert.match(css, /background: rgba\(255,255,255,\.98\)/);
  assert.match(css, /width: 68px/);
  assert.match(css, /width: 222px/);
  assert.match(css, /background: #f1edff/);
  assert.doesNotMatch(css, /\.atlas-toolspace|atlas-tools-open/);
});

test("dock controls remain usable without flashing selection animations", async () => {
  const [css, shell] = await Promise.all([
    read("../src/app/dock-studio.css"),
    read("../src/components/app-shell.tsx"),
  ]);
  assert.match(css, /transition: none/);
  assert.match(css, /background: #fff/);
  assert.match(shell, /<nav className="atlas-dock-nav"/);
  assert.doesNotMatch(shell, /<DockToolspace/);
});

test("dock remembers expansion and its position between client-side navigations", async () => {
  const [shell, hook] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
  ]);
  assert.match(shell, /let cachedExpanded: boolean \| null = null/);
  assert.match(shell, /useState\(\(\) => cachedExpanded \?\? false\)/);
  assert.match(shell, /cachedExpanded = next/);
  assert.match(hook, /let clientPlacement: Placement \| null = null/);
  assert.match(hook, /useState<Placement>\(\(\) => clientPlacement \?\? INITIAL_PLACEMENT\)/);
  assert.match(hook, /clientPlacement = placement/);
  assert.match(shell, /onPointerDown=\{handlePointerDown\}/);
});


test("a single stable dock survives route navigation without a remount", async () => {
  const [root, wrapper, shell, hook, styles] = await Promise.all([
    read("../src/app/layout.tsx"),
    read("../src/components/persistent-atlas-shell.tsx"),
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
    read("../src/app/dock-studio.css"),
  ]);
  assert.match(root, /<PersistentAtlasShell>\{children\}<\/PersistentAtlasShell>/);
  assert.match(wrapper, /<AppShellFrame>\{children\}<\/AppShellFrame>/);
  assert.match(wrapper, /pathname === "\/login"/);
  assert.match(shell, /createContext\(false\)/);
  assert.match(shell, /if \(insidePersistentShell\) return <>\{children\}<\/>/);
  assert.match(shell, /<AppShellContext.Provider value=\{true\}>/);
  assert.match(hook, /previous\.width === next\.width/);
  assert.match(hook, /positionTop\(placement\.vertical, geometry\.viewportHeight, geometry\.height\) \+ geometry\.height \/ 2/);
  assert.match(hook, /transform: "translateY\(-50%\)"/);
  assert.match(styles, /top: calc\(50% \+ 37px\)/);
  assert.match(styles, /will-change: auto/);
  assert.match(styles, /transition: none/);
});
