import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Workspaces uses authenticated server membership data and never demo data", async () => {
  const [page, dashboard, actions] = await Promise.all([
    read("../src/app/workspaces/page.tsx"),
    read("../src/components/workspaces-dashboard.tsx"),
    read("../src/app/workspaces/actions.ts"),
  ]);
  assert.match(page, /listWorkspaces\(\)/);
  assert.match(page, /result\.status === "ready"/);
  assert.match(page, /<WorkspacesDashboard workspaces=\{result\.workspaces\}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(actions, /supabase\.auth\.getUser\(\)/);
  assert.match(actions, /\.eq\("user_id", user\.id\)/);
  assert.match(dashboard, /workspaces\.filter/);
  assert.match(dashboard, /workspace\.role === "member"/);
  assert.doesNotMatch(page + dashboard, /demoWorkspaces|fixtures|mockWorkspaces|Math\.random\(\)/);
});

test("workspace creation keeps existing server action and safe permission model", async () => {
  const [page, dashboard, actions] = await Promise.all([
    read("../src/app/workspaces/page.tsx"),
    read("../src/components/workspaces-dashboard.tsx"),
    read("../src/app/workspaces/actions.ts"),
  ]);
  assert.match(dashboard, /action=\{createWorkspaceFromForm\}/);
  assert.match(dashboard, /useFormStatus/);
  assert.match(dashboard, /name="name" required minLength=\{1\} maxLength=\{120\}/);
  assert.match(page, /params\.createError === "1"/);
  assert.match(dashboard, /role="alert"/);
  assert.match(actions, /created_by: resolved\.userId/);
  assert.match(actions, /revalidatePath\("\/workspaces"\)/);
  assert.match(actions, /redirect\("\/workspaces"\)/);
});

test("workspaces are searchable, filterable, accessible, and responsive", async () => {
  const [page, dashboard, layout, css] = await Promise.all([
    read("../src/app/workspaces/page.tsx"),
    read("../src/components/workspaces-dashboard.tsx"),
    read("../src/app/layout.tsx"),
    read("../src/app/workspaces-redesign.css"),
  ]);
  assert.match(page, /Vos espaces de travail/);
  assert.match(dashboard, /type RoleFilter = "all" \| "managed" \| "member"/);
  assert.match(dashboard, /normalize\(workspace\.name\)/);
  assert.match(dashboard, /aria-pressed=\{roleFilter === value\}/);
  assert.match(dashboard, /id="atlas-workspaces-search"/);
  assert.match(dashboard, /aria-live="polite"/);
  assert.match(dashboard, /atlas-workspaces-grid/);
  assert.match(dashboard, /roleLabels\[workspace\.role\]/);
  assert.match(dashboard, /Aucun workspace trouvé/);
  assert.match(layout, /import "\.\/workspaces-redesign\.css"/);
  assert.match(css, /atlas-workspaces-layout/);
  assert.match(css, /@media\(max-width:540px\)/);
});
