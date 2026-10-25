/** Disposable PG17 only. Provider/resource authorization is a fake, not live evidence. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createEngineContextRepository, createEngineContextResolver } from "../packages/engine-core/src/context-resolver.mjs";
if (process.env.ATLAS_ENGINE_DISPOSABLE_TEST !== "1" || !["127.0.0.1", "localhost"].includes(process.env.PGHOST)) throw Error("DISPOSABLE_ONLY");
const read = new pg.Client({connectionTimeoutMillis:3000,statement_timeout:5000});
const mutate = new pg.Client({connectionTimeoutMillis:3000,statement_timeout:5000});
await read.connect(); await mutate.connect();
const W=randomUUID(), I=randomUUID(), R=randomUUID(), M=randomUUID(), S=randomUUID();
const A="11111111-1111-4111-8111-111111111111", OTHER="33333333-3333-4333-8333-333333333333";
const scope={workspaceId:W,instanceId:I,runId:R,atlasAgentKey:"fixture-agent",resources:[{
  provider:"github",connectionId:randomUUID(),resourceId:"pr_42_9",sourceVersion:"a".repeat(40),operation:"pull_requests.read"}]};
const repo=createEngineContextRepository({query:(text,values)=>read.query(text,values)});
let onAuthorize = async () => {};
const inspect=createEngineContextResolver({repository:repo,
  authenticate:async()=>({verified:true,actorId:A,sessionId:S,expiresAt:Date.now()+60000}),
  authorize:async({contextDigest})=>{
    await onAuthorize(); const checkedAt=Date.now();
    return {allowed:true,contextDigest,checkedAt,expiresAt:checkedAt+1000};
  }}).inspect;
const input={session:"fake-jwt-fixture",scope};
try {
  assert.equal(Number((await read.query("select count(*) as n from information_schema.columns where table_schema='auth' and table_name='users'")).rows[0].n),1);
  await mutate.query("insert into public.workspaces(id) values($1)",[W]);
  await mutate.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",[W,A]);
  await mutate.query("insert into public.atlas_missions(id,workspace_id,status) values($1,$2,'planned')",[M,W]);
  await mutate.query("insert into public.atlas_engine_instances(id,workspace_id,engine_key,label,created_by) values($1,$2,'mausbot','Context disposable fixture',$3)",[I,W,A]);
  await mutate.query("insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256) values($1,$2,$3,$4,$5,'conversations.messages.send',repeat('a',64))",[R,W,I,M,A]);
  await mutate.query("insert into private.atlas_engine_agent_bindings(workspace_id,instance_id,atlas_agent_key,remote_agent_key) values($1,$2,'fixture-agent','fixture-remote')",[W,I]);
  const restore=async()=>{
    onAuthorize=async()=>{};
    await mutate.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour') on conflict(id) do update set user_id=excluded.user_id,not_after=excluded.not_after",[S,A]);
    await mutate.query("update public.workspace_members set role='owner' where workspace_id=$1 and user_id=$2",[W,A]);
    await mutate.query("update public.atlas_missions set status='planned' where id=$1",[M]);
    await mutate.query("update public.atlas_engine_instances set connection_state='offline',version=1 where id=$1",[I]);
    await mutate.query("update private.atlas_engine_agent_bindings set remote_agent_key='fixture-remote' where workspace_id=$1 and instance_id=$2",[W,I]);
  };
  await restore();
  const baseline=(await read.query("select count(*)::integer as n from private.atlas_engine_outbox")).rows[0].n;
  assert.equal((await inspect(input)).canDispatch,false);
  console.log("Context: real joined SQL snapshot, fake provider evidence, no dispatch.");
  for(const [label,text,values] of [
    ["session deletion","delete from auth.sessions where id=$1",[S]],
    ["session expiry","update auth.sessions set not_after=now()-interval '1 second' where id=$1",[S]],
    ["session reassignment","update auth.sessions set user_id=$2 where id=$1",[S,OTHER]],
    ["role removal","update public.workspace_members set role='member' where workspace_id=$1 and user_id=$2",[W,A]],
    ["mission completion","update public.atlas_missions set status='done' where id=$1",[M]],
    ["instance suspension","update public.atlas_engine_instances set connection_state='suspended' where id=$1",[I]],
    ["agent binding removal","update private.atlas_engine_agent_bindings set remote_agent_key=null where workspace_id=$1 and instance_id=$2",[W,I]],
    ["agent replacement","update private.atlas_engine_agent_bindings set remote_agent_key='replacement' where workspace_id=$1 and instance_id=$2",[W,I]],
    ["instance version change","update public.atlas_engine_instances set version=2 where id=$1",[I]],
  ]) {
    await restore();
    onAuthorize=()=>mutate.query(text,values);
    await assert.rejects(inspect(input),/ENGINE_CONTEXT_(UNAVAILABLE|CHANGED)/,label);
    console.log(`Context concurrent revocation detected: ${label}.`);
  }
  await restore();
  for(const key of ["workspaceId","instanceId","runId"]) {
    await assert.rejects(inspect({...input,scope:{...scope,[key]:randomUUID()}}),/ENGINE_CONTEXT_UNAVAILABLE/);
  }
  await assert.rejects(inspect({...input,scope:{...scope,atlasAgentKey:"invented-agent"}}),/ENGINE_CONTEXT_UNAVAILABLE/);
  await read.query("begin isolation level repeatable read read only");
  try { await assert.rejects(inspect(input),/ENGINE_CONTEXT_UNAVAILABLE/); }
  finally { await read.query("rollback"); }
  console.log("Context: cross-workspace/instance/run and invented bindings refused; stale transaction isolation refused.");
  for(const role of ["anon","authenticated"]) {
    assert.equal((await read.query("select has_table_privilege($1,'private.atlas_engine_agent_bindings','SELECT') as allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await read.query("select count(*)::integer as n from private.atlas_engine_outbox")).rows[0].n,baseline);
  assert.equal((await read.query("select state from public.atlas_engine_runs where id=$1",[R])).rows[0].state,"draft");
  assert.equal((await read.query("select count(*)::integer as n from private.atlas_engine_audit_events where run_id=$1",[R])).rows[0].n,0);
  console.log("Context: zero outbox, zero audit mutations, run stays draft, private bindings still inaccessible to clients.");
} finally { await read.end(); await mutate.end(); }
