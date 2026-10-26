import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertEntityScope, publicMessage, replayReceipt, validContext } from "../src/lib/agent-gateway/policy.mjs";
import { mausbotReleasePermission, mausbotReleaseState } from "../packages/engine-core/src/release-gates.mjs";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const ctx = {workspaceId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",pageKey:"missions",entity:"FOUNDER",objectType:"mission",objectId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"};
test("B1 entity scope refuses unbound wildcard, hostile entity, mixed workspace and foreign objects",()=>{
  assert.equal(validContext(ctx),true);
  assert.equal(assertEntityScope("FOUNDER","FOUNDER",["FOUNDER"]),true);
  for(const entity of ["*","VELMO","WAHABI","NEW_PLATFORM","PERSO",null])
    assert.equal(assertEntityScope(entity,"FOUNDER",[]),false);
  assert.equal(assertEntityScope("FOUNDER","FOUNDER",["FOUNDER","VELMO"]),false);
  assert.equal(validContext({...ctx,workspaceId:"not-uuid"}),false);
  assert.equal(validContext({...ctx,objectType:"page",objectId:ctx.objectId}),false);
});
test("B1 send_id replay returns duplicate:true only for identical payload digest",()=>{
  const receipt={body_digest:"a".repeat(64),state:"accepted",thread_id:"real-thread"};
  assert.deepEqual(replayReceipt(null,receipt.body_digest),null);
  assert.deepEqual(replayReceipt(receipt,receipt.body_digest),{duplicate:true,accepted:true,threadId:"real-thread"});
  assert.deepEqual(replayReceipt(receipt,"b".repeat(64)),{conflict:true,code:"SEND_ID_PAYLOAD_MISMATCH"});
  assert.deepEqual(replayReceipt({...receipt,state:"unknown"},receipt.body_digest),{duplicate:true,accepted:false,threadId:"real-thread"});
});
test("B1 cannot output a fabricated reply or known secret patterns",()=>{
  assert.equal(publicMessage({text:"imagined"}),null);
  assert.equal(publicMessage({id:"m",text:1}),null);
  const result=publicMessage({id:"m1",role:"assistant",text:"Bearer abc123 sk-ABCDEFGHIJKLMNOP TOPSECRETVALUE"},"TOPSECRETVALUE");
  assert.ok(result);
  assert.ok(!result.text.includes("abc123") && !result.text.includes("ABCDEFGHIJKLMNOP") && !result.text.includes("TOPSECRETVALUE"));
});
test("B1 mutations remain hard-blocked under all releases",()=>{
  for(const stage of [undefined,"read-only","enabled","admin"]){
    const env={ATLAS_MAUSBOT_RELEASE_STAGE:stage};
    assert.equal(mausbotReleaseState(env).mutationsEnabled,false);
    assert.equal(mausbotReleasePermission(env,"write").allowed,false);
    assert.equal(mausbotReleasePermission(env,"execute").allowed,false);
  }
});
test("B1 API is owner-only, origin-protected, server-scoped, audited and never fakes chat",async()=>{
  const [ask,settings,thread,gateway,access,missions,panel,hook,css]=await Promise.all([
    source("../src/app/api/agent/ask/route.ts"),
    source("../src/app/api/agent/settings/route.ts"),
    source("../src/app/api/agent/thread/route.ts"),
    source("../src/lib/agent-gateway/index.ts"),
    source("../src/lib/agent-gateway/access.ts"),
    source("../src/app/missions/page.tsx"),
    source("../src/components/agent-panel.tsx"),
    source("../src/hooks/use-agent-context.ts"),
    source("../src/components/agent-panel.module.css"),
  ]);
  assert.match(ask,/request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.match(settings,/export async function PUT/);
  assert.match(settings,/export async function GET/);
  assert.match(thread,/export async function GET/);
  assert.match(access,/membership\?\.role !== "owner"/);
  assert.match(gateway,/verifyScope\(supabase, context\)/);
  assert.match(gateway,/if \(!mausbotReleaseState\(process\.env\)\.mutationsEnabled\)/);
  assert.match(gateway,/mausbotReleasePermission\(process\.env, "write"\)/);
  assert.match(gateway,/atlas_mausbot_action_begin/);
  assert.match(gateway,/sharedMausbotSendGuard\(\)\.reserve/);
  assert.match(gateway,/replayReceipt/);
  assert.match(gateway,/executeMausbotPrimitive\(config, "conversations\.messages\.list"/);
  assert.match(missions,/selected\?\.role === "owner"/);
  assert.match(missions,/<AgentPanel/);
  assert.match(hook,/export function useAgentContext/);
  assert.match(panel,/role="dialog"/);
  assert.match(panel,/Aucun message réel reçu/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(gateway,/service_role|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_MAUSBOT/);
});
test("B1 additive RLS schema, rollback and disposable CI are documented",async()=>{
  const [sql,rollback,ci]=await Promise.all([
    source("../supabase/migrations/20261026153500_atlas_agent_page_gateway.sql"),
    source("../supabase/rollbacks/20261026153500_atlas_agent_page_gateway_rollback.sql"),
    source("../.github/workflows/ci.yml"),
  ]);
  for(const table of ["agent_page_settings","agent_threads","agent_send_receipts"]){
    assert.match(sql,new RegExp("create table public\\."+table));
    assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(rollback,new RegExp("drop table if exists public\\."+table));
  }
  assert.match(sql,/wm\.role='owner'/);
  assert.match(sql,/MORGANS/);
  assert.match(sql,/ROGER/);
  assert.match(sql,/unique \(workspace_id,send_id\)/);
  assert.match(ci,/agent-gateway-checks\.sql/);
  assert.match(ci,/agent_page_gateway_rollback\.sql/);
});
