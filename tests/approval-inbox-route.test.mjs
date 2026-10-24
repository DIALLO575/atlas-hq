import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api=readFileSync(new URL("../src/app/api/engines/approvals/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../src/components/approval-inbox.tsx",import.meta.url),"utf8");

test("Inbox GET remains session-scoped, metadata-only and non-executable",()=>{
 assert.match(api,/export async function GET/);
 assert.match(api,/requireEngineWorkspace\(workspaceId, true\)/);
 assert.match(api,/\.rpc\("atlas_engine_pending_approvals"/);
 assert.match(api,/p_workspace_id: workspaceId/);
 assert.match(api,/readOnly: true/);
 assert.match(api,/canApprove: false/);
 assert.match(api,/canDispatch: false/);
});

test("Approval POST rejects unsafe origins, extra fields and forged auth flags",()=>{
 assert.match(api,/export async function POST/);
 assert.match(api,/request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
 assert.match(api,/content-type/);
 assert.match(api,/REQUEST_TOO_LARGE/);
 assert.match(api,/fields = \["workspaceId", "runId", "intentDigest", "decision"\]/);
 assert.match(api,/Object\.keys\(body\)\.length !== fields\.length/);
 assert.match(api,/requireEngineWorkspace\(body\.workspaceId, true\)/);
 assert.match(api,/\.rpc\("atlas_engine_decide_approval"/);
 assert.match(api,/p_intent_digest: body\.intentDigest/);
 assert.match(api,/p_decision: body\.decision/);
 assert.match(api,/can_dispatch !== false/);
 assert.match(api,/HUMAN_DECISION_ONLY_NO_ENGINE_DISPATCH/);
 assert.doesNotMatch(api,/SUPABASE_SERVICE_ROLE|mausbotDispatch|mausbotRequest|service_role|resolveMausbotConfig/);
});
test("Human reviewer sees exact digest, explicit approve/reject and safe status",()=>{
 assert.match(ui,/type="button"/);
 assert.match(ui,/void decide\(item, "approved"\)/);
 assert.match(ui,/void decide\(item, "rejected"\)/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/item\.intent_digest\}/);
 assert.match(ui,/method: "POST", credentials: "same-origin"/);
 assert.match(ui,/payload\.canDispatch !== false/);
 assert.doesNotMatch(ui,/mausbotDispatch|resolveMausbotConfig|NEXT_PUBLIC_.*SECRET/);
});
