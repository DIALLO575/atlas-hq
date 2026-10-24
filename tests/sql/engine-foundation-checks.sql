-- SHA-132 disposable integration verification. Never run against production.
\set ON_ERROR_STOP on
-- Two independent tenants, service provisioning initially in offline state.
insert into public.atlas_engine_instances(id,workspace_id,created_by,engine_key,label)
 values
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','mausbot','A'),
 ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','mausbot','B');
do $$
declare tab text;
begin
 foreach tab in array array[
  'atlas_engine_agent_bindings','atlas_engine_credentials',
  'atlas_engine_approvals','atlas_engine_outbox','atlas_engine_event_cursors',
  'atlas_engine_event_receipts','atlas_engine_audit_events'
 ] loop
  if not (select c.relrowsecurity from pg_class c
    where c.oid=format('private.%I',tab)::regclass) then
    raise exception 'PRIVATE_RLS_MISSING %', tab;
  end if;
  if has_table_privilege('authenticated',format('private.%I',tab),'SELECT') then
    raise exception 'PRIVATE_DATA_EXPOSED %',tab;
  end if;
 end loop;
 if has_table_privilege('anon','public.atlas_engine_instances','SELECT')
    or has_table_privilege('anon','public.atlas_engine_runs','SELECT') then
   raise exception 'ANON_ACCESS_TO_ENGINE_METADATA';
 end if;
 if has_table_privilege('authenticated','public.atlas_engine_runs','INSERT') then
   raise exception 'BROWSER_CAN_CREATE_ENGINE_EXECUTION';
 end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare seen integer;
begin
 select count(*) into seen from public.atlas_engine_instances;
 if seen<>1 then raise exception 'WORKSPACE_INSTANCE_RLS_LEAK';end if;
 if exists(select 1 from public.atlas_engine_instances where workspace_id=
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'CROSS_TENANT_VISIBLE';end if;
 begin
   insert into public.atlas_engine_instances(workspace_id,created_by,engine_key,label)
   values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'mausbot','foreign');
   raise exception 'CROSS_TENANT_REGISTERED';
 exception when insufficient_privilege then null;end;
 begin
   insert into public.atlas_engine_instances(workspace_id,created_by,engine_key,label,connection_state)
   values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'mausbot','spoof','connected');
   raise exception 'BROWSER_ENABLED_LIVE_ENGINE';
 exception when insufficient_privilege then null;end;
 begin
   update public.atlas_engine_instances set connection_state='connected';
   raise exception 'BROWSER_CAN_ACTIVATE_ENGINE';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Even service_role cannot accidentally invent cross-tenant relation.
set role service_role;
insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id)
values
 ('aaaaaaa1-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111','agents.list'),
 ('bbbbbbb2-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-0000-4000-8000-000000000002','ffffffff-ffff-4fff-8fff-ffffffffffff',
  '22222222-2222-4222-8222-222222222222','agents.list');

do $$
begin
 begin
   insert into public.atlas_engine_runs(workspace_id,instance_id,mission_id,requested_by,primitive_id)
   values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-0000-4000-8000-000000000002',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '11111111-1111-4111-8111-111111111111','agents.list');
   raise exception 'CROSS_WORKSPACE_ENGINE_RUN_CREATED';
 exception when foreign_key_violation then null;end;
end $$;

insert into private.atlas_engine_outbox(id,workspace_id,instance_id,run_id,idempotency_key,
 key_id,version,payload_nonce,payload_ciphertext,payload_tag)
values ('ddddddd1-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa1-0000-4000-8000-000000000001',
 'cccccccc-0000-4000-8000-000000000001','test-key-1',1,
 decode(repeat('0a',12),'hex'),decode('aabbcc','hex'),decode(repeat('1a',16),'hex'));

do $$
begin
 begin
  update private.atlas_engine_outbox set state='leased'
  where id='ddddddd1-0000-4000-8000-000000000001';
  raise exception 'UNAPPROVED_EXECUTION_LEASED';
 exception when insufficient_privilege then null;end;
 begin
  insert into private.atlas_engine_outbox(workspace_id,instance_id,run_id,idempotency_key,
   key_id,version,payload_nonce,payload_ciphertext,payload_tag)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaa1-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000001','test-key-1',1,
  decode(repeat('0a',12),'hex'),decode('aabbcc','hex'),decode(repeat('1a',16),'hex'));
  raise exception 'DUPLICATE_IDEMPOTENCY_KEY_ACCEPTED';
 exception when unique_violation then null;end;
end $$;

-- Same workspace, a DIFFERENT real human approves; offline status still blocks dispatch.
insert into private.atlas_engine_approvals(workspace_id,instance_id,run_id,requested_by,expires_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa1-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 now()+interval '1 hour');
do $$
begin
 begin
  update private.atlas_engine_approvals set decision='approved',
    decided_by='11111111-1111-4111-8111-111111111111',decided_at=now();
  raise exception 'ENGINE_SELF_APPROVAL_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  update private.atlas_engine_approvals set decision='approved',
    decided_by='22222222-2222-4222-8222-222222222222',decided_at=now();
  raise exception 'ENGINE_FOREIGN_REVIEWER_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
update private.atlas_engine_approvals set decision='approved',
 decided_by='33333333-3333-4333-8333-333333333333', decided_at=now();
do $$
begin
 begin
  update private.atlas_engine_approvals set decision='rejected',
    decided_by='33333333-3333-4333-8333-333333333333',decided_at=now();
  raise exception 'ENGINE_REAPPROVAL_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
update public.atlas_engine_runs set state='authorized'
 where id='aaaaaaa1-0000-4000-8000-000000000001';
do $$
begin
 begin
  update private.atlas_engine_outbox set state='leased'
  where id='ddddddd1-0000-4000-8000-000000000001';
  raise exception 'OFFLINE_INSTANCE_EXECUTED';
 exception when insufficient_privilege then null;end;
end $$;
-- Only a reviewed release process could enable the instance; demonstrate gate atomically.
update public.atlas_engine_instances set connection_state='connected'
 where id='aaaaaaaa-0000-4000-8000-000000000001';
update private.atlas_engine_outbox set state='leased'
 where id='ddddddd1-0000-4000-8000-000000000001';
do $$
begin
 if not exists (select 1 from private.atlas_engine_outbox
   where id='ddddddd1-0000-4000-8000-000000000001' and state='leased') then
   raise exception 'APPROVED_OUTBOX_GATE_DID_NOT_OPEN';end if;
end $$;

insert into private.atlas_engine_audit_events(workspace_id,instance_id,run_id,event_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa1-0000-4000-8000-000000000001','run.approved');
do $$
begin
 begin
  update private.atlas_engine_audit_events set event_key='run.edited';
  raise exception 'AUDIT_MUTATED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare seen integer;
begin
 select count(*) into seen from public.atlas_engine_instances;
 if seen<>1 then raise exception 'TENANT_B_INSTANCE_RLS_LEAK';end if;
 select count(*) into seen from public.atlas_engine_runs;
 if seen<>1 then raise exception 'TENANT_B_RUN_RLS_LEAK';end if;
end $$;
reset role;

-- Verified additive encryption metadata: new messages must carry a key ID.
do $$
begin
 if exists (
  select 1 from information_schema.columns
  where table_schema='private' and table_name='atlas_engine_outbox'
    and column_name='key_id' and is_nullable='YES'
 ) then raise exception 'ENGINE_OUTBOX_KEY_ID_NULLABLE'; end if;
 if (select count(*) from information_schema.columns
     where table_schema='private' and table_name='atlas_engine_outbox'
     and column_name in ('key_id','version'))<>2 then
   raise exception 'ENGINE_OUTBOX_ENVELOPE_COLUMNS_MISSING';
 end if;
end $$;
