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


test("clicking Déplacer opens an accessible, non-reflowing four-direction controller", async () => {
  const [shell, hook, styles, icon] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
    read("../src/app/dock-studio.css"),
    read("../src/components/icon.tsx"),
  ]);
  assert.match(shell, /aria-expanded=\{moveControlsOpen\}/);
  assert.match(shell, /id="atlas-dock-move-panel"/);
  assert.match(shell, /className="atlas-dock-move-pad"/);
  assert.match(shell, /aria-label="Monter le dock"/);
  assert.match(shell, /aria-label="Descendre le dock"/);
  assert.match(shell, /aria-label="Envoyer le dock à gauche"/);
  assert.match(shell, /aria-label="Envoyer le dock à droite"/);
  assert.match(shell, /onClick=\{\(\) => moveDock\("up"\)\}/);
  assert.match(shell, /onClick=\{\(\) => moveDock\("right"\)\}/);
  assert.match(hook, /ARROW_STEP_PX = 48/);
  assert.match(hook, /storePlacement\(next\)/);
  assert.match(hook, /Math\.hypot/);
  assert.match(hook, /consumeDragClick/);
  assert.match(styles, /position: "fixed"|\.atlas-dock-move-panel \{/);
  assert.match(styles, /z-index: 44/);
  assert.match(icon, /"arrow-up"/);
  assert.match(icon, /"arrow-down"/);
});


test("top and bottom docks snap to the horizontal center without remounting", async () => {
  const [hook, shell, css] = await Promise.all([
    read("../src/components/use-floating-dock.ts"),
    read("../src/components/app-shell.tsx"),
    read("../src/app/dock-studio.css"),
  ]);
  assert.match(hook, /type Side = "left" \| "right" \| "top" \| "bottom"/);
  assert.match(hook, /candidate\.side !== "top"/);
  assert.match(hook, /candidate\.side !== "bottom"/);
  assert.match(hook, /const placeDock = \(side: Side\)/);
  assert.match(hook, /const centerDock = \(\)/);
  assert.match(hook, /if \(placement\.side === "top" \|\| placement\.side === "bottom"\) return \{\}/);
  assert.match(shell, /onClick=\{\(\) => placeDock\("top"\)\}/);
  assert.match(shell, /onClick=\{\(\) => placeDock\("bottom"\)\}/);
  assert.match(shell, /onClick=\{centerDock\}/);
  assert.match(shell, /aria-pressed=\{dockSide === "top"\}/);
  assert.match(css, /data-dock-side="top"/);
  assert.match(css, /data-dock-side="bottom"/);
  assert.match(css, /left: 50%/);
  assert.match(css, /transform: translateX\(-50%\)/);
  assert.match(css, /flex-direction: row/);
  assert.match(css, /padding-top: 177px/);
  assert.match(css, /padding-bottom: 104px/);
  assert.match(css, /@media \(min-width: 761px\)/);
});
