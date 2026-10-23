import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Dock Studio uses a neutral light surface, not the saturated purple island", async () => {
  const css = await read("../src/app/dock-studio.css");
  assert.match(css, /background: linear-gradient\(160deg,#ffffff 0%,#fcfbff 100%\)/);
  assert.match(css, /color: #37364d/);
  assert.match(css, /background:#efebfa/);
  assert.match(css, /background:linear-gradient\(160deg,#fff,#faf9fe\)/);
  assert.doesNotMatch(css, /#8259ee|#6640ce|#4f2aa9|#835bf0|#5730b9/);
});

test("Menu tab changes do not animate or replay a flashing entrance effect", async () => {
  const css = await read("../src/app/dock-studio.css");
  assert.doesNotMatch(css, /@keyframes atlas-tools-arrive/);
  assert.match(css, /\.atlas-shell \.atlas-smart-dock \.atlas-dock-link,[\s\S]*?animation: none;\s*transition: none;/);
  assert.match(css, /-webkit-tap-highlight-color:transparent/);
  assert.match(css, /\.atlas-smart-dock \.atlas-dock-link:focus-visible/);
});

test("Dock retains expansion, edge position and pins between client-side page navigations", async () => {
  const [shell, dockHook] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
  ]);
  assert.match(shell, /let cachedExpanded: boolean \| null = null/);
  assert.match(shell, /useState\(\(\) => cachedExpanded \?\? false\)/);
  assert.match(shell, /cachedExpanded = next/);
  assert.match(shell, /let cachedPinnedIds: readonly DockToolId\[\] \| null = null/);
  assert.match(shell, /cachedPinnedIds = next/);
  assert.match(dockHook, /let clientPlacement: Placement \| null = null/);
  assert.match(dockHook, /useState<Placement>\(\(\) => clientPlacement \?\? INITIAL_PLACEMENT\)/);
  assert.match(dockHook, /clientPlacement = placement/);
  assert.match(shell, /<DockToolspace/);
  assert.match(shell, /onPointerDown=\{handlePointerDown\}/);
});
