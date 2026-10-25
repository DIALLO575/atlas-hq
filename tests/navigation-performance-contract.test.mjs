import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("app directory avoids unnecessary authenticated round trips", async () => {
  const [page, dir, githubPage, connect] = await Promise.all([
    read("../src/app/apps/page.tsx"),
    read("../src/components/apps-directory.tsx"),
    read("../src/app/apps/github/page.tsx"),
    read("../src/lib/github/connect.ts"),
  ]);
  assert.match(page, /export default function AppsPage/);
  assert.doesNotMatch(page, /await|force-dynamic|workspace_members|atlas_github_installations|createSupabaseServerClient/);
  assert.match(dir, /import Link from "next\/link"/);
  assert.match(dir, /<Link className="atlas-app-details" href="\/apps\/github" prefetch=\{true\}/);
  assert.match(dir, /Piloter <Icon/);
  assert.match(githubPage, /searchParams: Promise<\{ workspaceId\?: string; github\?: string; studioAuth\?: string \}>/);
  assert.match(githubPage, /params\.github === "connected"/);
  assert.match(connect, /new URL\("\/apps\/github", settings\.publicOrigin\)/);
});

test("Missions and Inbox share only one authenticated membership read per request", async () => {
  const source = await read("../src/lib/atlas-workflow.ts");
  assert.equal((source.match(/supabase\.auth\.getUser\(\)/g) ?? []).length, 1);
  assert.equal((source.match(/from\("workspace_members"\)/g) ?? []).length, 1);
  assert.doesNotMatch(source, /await listWorkspaces\(\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /from\("atlas_missions"\)/);
  assert.match(source, /from\("atlas_mission_reviews"\)/);
});

test("dock retains its position and shows responsive navigation progress", async () => {
  const [shell, dock, root, styles] = await Promise.all([
    read("../src/components/app-shell.tsx"),
    read("../src/components/use-floating-dock.ts"),
    read("../src/components/persistent-atlas-shell.tsx"),
    read("../src/app/route-performance.css"),
  ]);
  assert.match(shell, /const \[navigatingTo, setNavigatingTo\] = useState/);
  assert.match(shell, /router\.prefetch\(href\)/);
  assert.match(shell, /handleRouteClick\(item\.href\)/);
  assert.match(shell, /isRoutePending &&/);
  assert.match(shell, /atlas-route-transition-track/);
  assert.match(shell, /setTimeout\(\(\) => setNavigatingTo\(null\), 12000\)/);
  assert.match(root, /<AppShellFrame>\{children\}<\/AppShellFrame>/);
  assert.match(dock, /let clientPlacement: Placement \| null = null/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test("route fallbacks show a styled loading skeleton without remounting the dock", async () => {
  const [states, githubLoader, css, layout] = await Promise.all([
    read("../src/components/route-states.tsx"),
    read("../src/app/apps/github/loading.tsx"),
    read("../src/app/route-performance.css"),
    read("../src/app/layout.tsx"),
  ]);
  assert.match(states, /aria-busy="true"/);
  assert.match(states, /role="status" aria-live="polite"/);
  assert.match(states, /atlas-skeleton-kpis/);
  assert.match(states, /atlas-skeleton-layout/);
  assert.match(states, /<AppShell>/);
  assert.match(githubLoader, /LoadingState label="GitHub"/);
  assert.match(layout, /route-performance\.css/);
  assert.match(css, /atlas-skeleton-shimmer/);
  assert.match(css, /atlas-route-progress/);
});
