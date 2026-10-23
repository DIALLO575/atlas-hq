import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Smart Dock has a dedicated drag handle and does not hijack navigation clicks", async () => {
  const [shell, hook] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
  ]);
  assert.match(shell, /useFloatingDock\(\)/);
  assert.match(shell, /ref=\{dockRef\}/);
  assert.match(shell, /onPointerDown=\{handlePointerDown\}/);
  assert.match(shell, /handlePointerMove\(event\)/);
  assert.match(shell, /onPointerUp=\{handlePointerUp\}/);
  assert.match(shell, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(shell, /aria-label="Déplacer le menu flottant"/);
  assert.match(shell, /onKeyDown=\{handleKeyboardMove\}/);
  assert.match(shell, /onDoubleClick=\{resetPosition\}/);
  assert.match(shell, /data-dock-side=\{dockSide\}/);
  assert.match(hook, /setPointerCapture/);
  assert.match(hook, /releasePointerCapture/);
  assert.match(hook, /event\.currentTarget\.hasPointerCapture/);
  assert.match(hook, /if \(event\.button !== 0 \|\| window\.innerWidth <= 760\) return/);
  assert.match(shell, /aria-current=\{pathname === item\.href \? "page"/);
});

test("Smart Dock snaps to an edge, stays inside the viewport, and remembers its placement", async () => {
  const hook = await read("../src/components/use-floating-dock.ts");
  assert.match(hook, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(hook, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(hook, /point\.x \+ width \/ 2 >= window\.innerWidth \/ 2 \? "right" : "left"/);
  assert.match(hook, /topBounds\(window\.innerHeight, height\)/);
  assert.match(hook, /clamp\(event\.clientX - start\.offsetX/);
  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /addEventListener\("resize", measure\)/);
  assert.match(hook, /Number\.isFinite\(candidate\.vertical\)/);
  assert.match(hook, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End/);
  assert.match(hook, /storePlacement\(INITIAL_PLACEMENT\)/);
});

test("expanded or right-side docks reserve content space; mobile is a static drawer", async () => {
  const [styles, shell, layout] = await Promise.all([
    read("../src/app/smart-dock.css"),
    read("../src/components/app-shell.tsx"),
    read("../src/app/layout.tsx"),
  ]);
  assert.match(styles, /\[data-dock-side="right"\].*\.atlas-main-frame/);
  assert.match(styles, /\[data-dock-side="right"\].*\.atlas-topbar/);
  assert.match(styles, /max-width: 760px/);
  assert.match(styles, /transform:translateX\(0\)!important/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /touch-action: none/);
  assert.match(shell, /aria-expanded=\{expanded\}/);
  assert.match(shell, /atlas-mobile-bottom/);
  assert.match(layout, /import "\.\/smart-dock\.css"/);
});
