import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api=readFileSync(new URL("../src/app/api/engines/approvals/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../src/components/approval-inbox.tsx",import.meta.url),"utf8");

test("Read-only approval API reuses user session and independent SQL-verified inbox",()=>{
 assert.match(api,/export async function GET/);
 assert.match(api,/requireEngineWorkspace\(workspaceId, true\)/);
 assert.match(api,/createSupabaseServerClient\(/);
 assert.match(api,/\.rpc\("atlas_engine_pending_approvals"/);
 assert.match(api,/p_workspace_id: workspaceId/);
 assert.match(api,/readOnly: true/);
 assert.match(api,/canApprove: false/);
 assert.match(api,/canDispatch: false/);
 assert.doesNotMatch(api,/export async function POST|service_role|SUPABASE_SECRET|mausbotRequest|approved: true/);
});

test("Inbox UI contains no approval or execute command",()=>{
 assert.match(ui,/credentials:"same-origin"/);
 assert.match(ui,/method:"GET"/);
 assert.match(ui,/canDispatch|exécution des missions restent désactivées/);
 assert.doesNotMatch(ui,/method:"POST"|onClick=.*approve|mausbotDispatch|service_role/);
});
