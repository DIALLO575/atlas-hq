import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Missions & Inbox render real workspace data, not demo cards", async () => {
  const [missions, inbox, data, css] = await Promise.all([
    read("../src/app/missions/page.tsx"),
    read("../src/app/inbox/page.tsx"),
    read("../src/lib/atlas-workflow.ts"),
    read("../src/app/workflow-redesign.css"),
  ]);
  assert.match(missions, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(inbox, /readAtlasWorkflow\(params\.workspaceId\)/);
  assert.match(data, /from\("workspace_members"\)/);
  assert.match(data, /\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(data, /await listWorkspaces\(\)/);
  assert.match(data, /supabase\.auth\.getUser\(\)/);
  assert.match(data, /from\("atlas_missions"\)/);
  assert.match(data, /from\("atlas_mission_reviews"\)/);
  assert.match(data, /\.eq\("workspace_id", selected\.id\)/);
  assert.match(missions, /mission\.title/);
  assert.match(inbox, /review\.title/);
  assert.match(missions, /Aucune mission trouvée/);
  assert.match(inbox, /Tout est à jour/);
  assert.doesNotMatch(missions + inbox, /DemoNotice|EmptyPanel|Math\.random|fakeMission/);
  assert.match(css, /atlas-flow-mission-grid/);
  assert.match(css, /atlas-flow-review-card/);
  assert.match(css, /@media\(max-width:540px\)/);
});

test("missions and approvals use authenticated server actions and scoped RLS", async () => {
  const [actions, sql] = await Promise.all([
    read("../src/app/missions/actions.ts"),
    read("../supabase/migrations/20261023235000_atlas_missions_inbox_workflow.sql"),
  ]);
  assert.match(actions, /createSupabaseServerClient\(\)/);
  assert.match(actions, /supabase\.auth\.getUser\(\)/);
  assert.match(actions, /listWorkspaces\(\)/);
  assert.match(actions, /UUID\.test\(workspaceId\)/);
  assert.match(actions, /result\.status !== "ready"/);
  assert.match(actions, /from\("atlas_missions"\)\.insert/);
  assert.match(actions, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(actions, /rpc\("request_atlas_mission_review"/);
  assert.match(actions, /rpc\("decide_atlas_mission_review"/);
  assert.match(actions, /"owner", "admin"/);
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /public\.atlas_missions enable row level security/);
  assert.match(sql, /public\.atlas_mission_reviews enable row level security/);
  assert.match(sql, /private\.is_workspace_member\(workspace_id\)/);
  assert.match(sql, /private\.is_workspace_admin\(workspace_id\)/);
  assert.match(sql, /grant update\(status\) on public\.atlas_missions to authenticated/);
  assert.match(sql, /grant update\(decision\) on public\.atlas_mission_reviews to authenticated/);
  assert.match(sql, /requested_by = \(select auth\.uid\(\)\)/);
  assert.match(sql, /mission_id, workspace_id/);
  assert.match(sql, /where decision='pending'/);
  assert.doesNotMatch(sql, /grant all on public\.atlas_missions|grant delete on public\.atlas_missions|security definer/i);
});

test("workflow actions don't let clients invent users or bypass approval decisions", async () => {
  const [actions, missions, inbox, sql] = await Promise.all([
    read("../src/app/missions/actions.ts"),
    read("../src/app/missions/page.tsx"),
    read("../src/app/inbox/page.tsx"),
    read("../supabase/migrations/20261023235000_atlas_missions_inbox_workflow.sql"),
  ]);
  assert.match(actions, /created_by: ctx\.userId/);
  assert.match(actions, /!ctx \|\| !\["owner", "admin"\]\.includes\(ctx\.role\)/);
  assert.match(actions, /revalidatePath\("\/missions"\)/);
  assert.match(actions, /revalidatePath\("\/inbox"\)/);
  assert.match(sql, /create or replace function public\.decide_atlas_mission_review/);
  assert.match(sql, /create or replace function public\.request_atlas_mission_review/);
  assert.match(sql, /new\.decided_by = auth\.uid\(\)/);
  assert.match(sql, /new\.decided_at = now\(\)/);
  assert.match(missions, /form action=\{createAtlasMission\}/);
  assert.match(missions, /form action=\{requestAtlasMissionReview\}/);
  assert.match(inbox, /form action=\{decideAtlasMissionReview\}/);
  assert.match(inbox, /canDecide=\{admin\}/);
  assert.doesNotMatch(actions + inbox, /service_role|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SECRET/);
});

test("missions and inbox use responsive compact navigation and accessible statuses", async () => {
  const [missions, inbox, layout] = await Promise.all([
    read("../src/app/missions/page.tsx"),
    read("../src/app/inbox/page.tsx"),
    read("../src/app/layout.tsx"),
  ]);
  assert.match(layout, /workflow-redesign\.css/);
  assert.match(missions, /aria-label="Filtrer par statut"/);
  assert.match(inbox, /aria-label="Vue Inbox"/);
  assert.match(missions, /role="search"/);
  assert.match(missions + inbox, /role="alert"/);
  assert.match(missions, /Nouvelle mission/);
  assert.match(inbox, /Approuver/);
  assert.match(inbox, /Refuser/);
});
