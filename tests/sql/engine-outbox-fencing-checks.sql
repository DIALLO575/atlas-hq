-- SHA-151 fencing tests: disposable PostgreSQL ONLY, never live engine IO.
\set ON_ERROR_STOP on
do $$
begin
 if has_function_privilege('authenticated',
  'private.atlas_engine_worker_claim(uuid,text,integer)','EXECUTE')
 then raise exception 'BROWSER_CAN_CLAIM_WORK';end if;
 if has_function_privilege('anon',
  'private.atlas_engine_worker_finish(uuid,uuid,text,uuid,bigint,boolean,text)','EXECUTE')
 then raise exception 'ANON_CAN_FINISH_WORK';end if;
 if not has_function_privilege('service_role',
  'private.atlas_engine_worker_claim(uuid,text,integer)','EXECUTE')
 then raise exception 'WORKER_CANNOT_CLAIM';end if;
 if (select count(*) from information_schema.columns
  where table_schema='private' and table_name='atlas_engine_outbox'
   and column_name in ('lease_token','lease_epoch','lease_owner',
   'next_attempt_at','last_error_code'))<>5 then
 raise exception 'LEASE_SCHEMA_INCOMPLETE';end if;
end $$;
-- New encrypted fictional outbox entries for an ALREADY approved fake run.
-- The earlier test approved run aaaaaaa1, with state authorized.
insert into private.atlas_engine_outbox
 (id,workspace_id,instance_id,run_id,idempotency_key,key_id,version,
 payload_nonce,payload_ciphertext,payload_tag)
values
 ('ddddddd3-0000-4000-8000-000000000003',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa1-0000-4000-8000-000000000001',
 'cccccccc-0000-4000-8000-000000000003','test-key-1',1,
 decode(repeat('0a',12),'hex'),decode('aabbcc','hex'),decode(repeat('1a',16),'hex')),
 ('ddddddd4-0000-4000-8000-000000000004',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa1-0000-4000-8000-000000000001',
 'cccccccc-0000-4000-8000-000000000004','test-key-1',1,
 decode(repeat('0a',12),'hex'),decode('aabbcc','hex'),decode(repeat('1a',16),'hex'));

-- An engine is ALWAYS offline in production now: verify no candidate leaks.
update public.atlas_engine_instances set connection_state='offline'
 where id='aaaaaaaa-0000-4000-8000-000000000001';
set role service_role;
do $$
begin
 if exists(select 1 from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','worker-one',45)) then
   raise exception 'WORKER_CLAIMED_OFFLINE_ENGINE';
 end if;
end $$;
reset role;
-- SIMULATION ONLY: fake an approved connected engine in disposable PostgreSQL.
update public.atlas_engine_instances set connection_state='connected'
 where id='aaaaaaaa-0000-4000-8000-000000000001';
create temp table worker_tokens(
 worker text,job uuid,token uuid,epoch bigint,primary key(worker,job));

set role service_role;
do $$
declare row_a record; row_b record; after_retry record;
begin
 select * into row_a from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','worker-one',45);
 if row_a.outbox_id is null or row_a.lease_epoch<>1 then
  raise exception 'FIRST_WORKER_DID_NOT_CLAIM';end if;
 insert into worker_tokens values ('worker-one',row_a.outbox_id,row_a.lease_token,row_a.lease_epoch);
 if private.atlas_engine_worker_heartbeat(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',row_a.outbox_id,
    'intruder',row_a.lease_token,row_a.lease_epoch,45) then
  raise exception 'FOREIGN_WORKER_HEARTBEAT';end if;
 if private.atlas_engine_worker_heartbeat(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',row_a.outbox_id,
    'worker-one',gen_random_uuid(),row_a.lease_epoch,45) then
  raise exception 'UNKNOWN_TOKEN_HEARTBEAT';end if;
 if not private.atlas_engine_worker_heartbeat(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',row_a.outbox_id,
    'worker-one',row_a.lease_token,row_a.lease_epoch,45) then
  raise exception 'VALID_WORKER_HEARTBEAT_FAILED';end if;
 -- A second worker must claim a *different* job, never the same lease.
 select * into row_b from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','worker-two',45);
 if row_b.outbox_id is null or row_b.outbox_id=row_a.outbox_id then
  raise exception 'DUPLICATE_WORKER_CLAIM';end if;
 insert into worker_tokens values ('worker-two',row_b.outbox_id,row_b.lease_token,row_b.lease_epoch);
 if exists(select 1 from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','worker-three',45)) then
  raise exception 'UNEXPECTED_EXTRA_WORK';end if;
 -- First job completes: old token can never finish again.
 if private.atlas_engine_worker_finish(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',row_a.outbox_id,'worker-one',
  row_a.lease_token,row_a.lease_epoch,true,null)<>'delivered' then
  raise exception 'DELIVERY_NOT_PERSISTED';end if;
 begin
  perform private.atlas_engine_worker_finish(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',row_a.outbox_id,'worker-one',
   row_a.lease_token,row_a.lease_epoch,true,null);
  raise exception 'REPLAYED_FINISH_SUCCEEDED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Simulated worker-two crashes and its lease expires.
update private.atlas_engine_outbox set lease_until=clock_timestamp()-interval '2 seconds'
 where id=(select job from worker_tokens where worker='worker-two');
set role service_role;
do $$
declare before record; recovered record;
begin
 select * into before from worker_tokens where worker='worker-two';
 select * into recovered from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','worker-recovery',45);
 if recovered.outbox_id is distinct from before.job
   or recovered.lease_epoch<>before.epoch+1 or recovered.lease_token=before.token then
    raise exception 'LEASE_RECOVERY_NOT_FENCED';end if;
 begin
  perform private.atlas_engine_worker_finish(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',before.job,
   'worker-two',before.token,before.epoch,false,'RETRYABLE');
  raise exception 'STALE_WORKER_COMPLETED';
 exception when insufficient_privilege then null;end;
 if private.atlas_engine_worker_finish(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',recovered.outbox_id,
  'worker-recovery',recovered.lease_token,recovered.lease_epoch,
  false,'NETWORK_TIMEOUT')<>'retry' then
  raise exception 'BOUNDED_RETRY_NOT_SCHEDULED';end if;
 if exists(select 1 from private.atlas_engine_worker_claim(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','early-worker',45)) then
  raise exception 'RETRY_BEFORE_NEXT_ATTEMPT';end if;
end $$;
reset role;
do $$
begin
 if (select count(*) from private.atlas_engine_outbox where
 id in ('ddddddd3-0000-4000-8000-000000000003',
        'ddddddd4-0000-4000-8000-000000000004') and
 (state='leased' or lease_token is not null or lease_owner is not null))<>0 then
  raise exception 'FINISHED_LEASE_STILL_OPEN';end if;
 if (select count(*) from private.atlas_engine_audit_events
 where event_key in ('engine.outbox.leased','engine.outbox.retry','engine.outbox.delivered'))<5 then
  raise exception 'MISSING_LEASE_AUDIT';end if;
 if has_table_privilege('authenticated','private.atlas_engine_outbox','SELECT') then
  raise exception 'ENCRYPTED_PAYLOAD_READABLE_BY_BROWSER';end if;
end $$;
-- No MAUSBOT connection or network occurred; restore the fake engine offline.
update public.atlas_engine_instances set connection_state='offline'
 where id='aaaaaaaa-0000-4000-8000-000000000001';
