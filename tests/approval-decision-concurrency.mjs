/** SHA-150: real PostgreSQL connections, never Supabase Auth/E2E evidence. */
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.env.ATLAS_ENGINE_DISPOSABLE_TEST !== '1' ||
    !['127.0.0.1', 'localhost'].includes(process.env.PGHOST)) {
  throw new Error('Disposable local PostgreSQL opt-in required');
}
const query = sql => execFileSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql],
  { encoding: 'utf8', timeout: 10000 }).trim();
assert.equal(query("select count(*) from information_schema.columns where table_schema='auth' and table_name='users'"), '1',
  'Only the minimal disposable auth fixture is allowed');
const workspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const instance = 'aaaaaaaa-0000-4000-8000-000000000001';
const mission = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const requester = '11111111-1111-4111-8111-111111111111';
const reviewerA = '33333333-3333-4333-8333-333333333333';
const reviewerB = '22222222-2222-4222-8222-222222222222';
const sessionA = randomUUID();
const sessionB = randomUUID();
query(`update public.workspace_members set role='admin' where workspace_id='${workspace}' and user_id='${reviewerA}';
 insert into public.workspace_members(workspace_id,user_id,role) values('${workspace}','${reviewerB}','admin') on conflict(workspace_id,user_id) do update set role='admin';
 insert into auth.sessions(id,user_id,not_after) values('${sessionA}','${reviewerA}',now()+interval '1 hour'),('${sessionB}','${reviewerB}',now()+interval '1 hour');`);
const children = new Set();
function client(name) {
  const proc = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...process.env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(proc);
  const state = { proc, out: '', err: '', code: undefined };
  proc.stdout.on('data', data => { state.out += data; });
  proc.stderr.on('data', data => { state.err += data; });
  state.done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', code => { state.code = code; children.delete(proc); resolve(code); });
  });
  return state;
}
async function until(predicate, label) {
  const deadline = Date.now() + 8000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timeout: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
function decisionSql(run, digest, actor, session, decision) {
  return `set statement_timeout='10s'; set lock_timeout='8s'; set role authenticated;
   select set_config('request.jwt.claim.sub','${actor}',false);
   select set_config('request.jwt.claims','{"session_id":"${session}"}',false);
   select decision || ':' || can_dispatch::text from public.atlas_engine_decide_approval(
    '${workspace}','${run}','${digest}','${decision}');`;
}
try {
  for (const [first, second] of [['approved', 'rejected'], ['rejected', 'approved'], ['approved', 'approved']]) {
    const run = randomUUID();
    const baseline = query('select count(*) from private.atlas_engine_outbox');
    const digest = query(`insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256)
     values('${run}','${workspace}','${instance}','${mission}','${requester}','agents.list',repeat('a',64));
     insert into private.atlas_engine_approvals(workspace_id,instance_id,run_id,requested_by,expires_at,intent_digest)
     values('${workspace}','${instance}','${run}','${requester}',now()+interval '15 minutes',
       private.atlas_engine_intent_digest('${workspace}','${instance}','${run}','${mission}','agents.list',repeat('a',64)))
     returning intent_digest;`);
    assert.match(digest, /^[a-f0-9]{64}$/);
    const a = client(`approval-a-${run}`);
    const bName = `approval-b-${run}`;
    const b = client(bName);
    // Keep A's decision and audit uncommitted until B demonstrably waits on its row lock.
    a.proc.stdin.write(`begin; ${decisionSql(run, digest, reviewerA, sessionA, first)}\n\\echo DECISION_HELD\n`);
    await until(() => a.out.includes('DECISION_HELD') || a.code !== undefined, 'first decision');
    assert.equal(a.code, undefined, a.err);
    assert.ok(a.out.includes(`${first}:false`), a.out);
    b.proc.stdin.end(decisionSql(run, digest, reviewerB, sessionB, second));
    await until(() => b.code !== undefined || query(`select count(*) from pg_stat_activity where application_name='${bName}' and wait_event_type='Lock'`) === '1', 'contending decision lock');
    assert.equal(b.code, undefined, `Second connection must block before commit: ${b.err}`);
    a.proc.stdin.end('commit;\n');
    assert.equal(await a.done, 0, a.err);
    assert.notEqual(await b.done, 0, 'Second decision must fail');
    assert.match(b.err, /ENGINE_APPROVAL_NOT_AVAILABLE/);
    assert.equal(query(`select decision || ':' || decided_by::text from private.atlas_engine_approvals where run_id='${run}'`), `${first}:${reviewerA}`);
    assert.equal(query(`select count(*) from private.atlas_engine_audit_events where run_id='${run}' and event_key='engine.approval.${first}'`), '1');
    assert.equal(query(`select count(*) from private.atlas_engine_audit_events where run_id='${run}'`), '1');
    assert.equal(query(`select state from public.atlas_engine_runs where id='${run}'`), 'draft');
    assert.equal(query('select count(*) from private.atlas_engine_outbox'), baseline);
    console.log(`${first}/${second}: two connections contended; one decision, one audit, no authorization or outbox`);
  }
} finally {
  for (const proc of children) proc.kill('SIGKILL');
}
