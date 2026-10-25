-- SHA-177: PostgreSQL 17 disposable verification only.
\set ON_ERROR_STOP on

do $$
begin
 if not (select relrowsecurity from pg_class
   where oid='private.atlas_automation_callback_receipts'::regclass)
 then raise exception 'N8N_CALLBACK_RECEIPTS_RLS_OFF';end if;
 if has_table_privilege('authenticated','private.atlas_automation_callback_receipts','SELECT')
   or has_table_privilege('authenticated','private.atlas_automation_callback_receipts','INSERT')
   or has_table_privilege('anon','private.atlas_automation_callback_receipts','SELECT')
 then raise exception 'N8N_CALLBACK_RECEIPTS_CLIENT_GRANT';end if;
 if not has_table_privilege('service_role','private.atlas_automation_callback_receipts','INSERT')
 then raise exception 'N8N_CALLBACK_RECEIPTS_SERVICE_ROLE_UNAVAILABLE';end if;
 if (select count(*) from pg_policies
    where schemaname='private' and tablename='atlas_automation_callback_receipts')<>0
 then raise exception 'N8N_CALLBACK_RECEIPTS_UNEXPECTED_POLICY';end if;
end $$;

-- Existing disposable Engine/n8n fixture contains two workspaces with the
-- same remote execution ids. Never execute these fixture inserts in Atlas prod.
set role service_role;
insert into private.atlas_automation_callback_receipts
 (id,workspace_id,instance_id,execution_id,nonce,key_id,body_sha256,
  reported_status,event_at)
values
 ('aaaa2000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaa1000-0000-4000-8000-000000000001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','sandbox-v1',
  repeat('a',64),'success',now()),
 ('bbbb2000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'bbbb1000-0000-4000-8000-000000000001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','sandbox-v1',
  repeat('b',64),'waiting',now());

do $$
begin
 if (select count(*) from private.atlas_automation_callback_receipts)<>2
 then raise exception 'N8N_CALLBACK_TENANT_RECEIPTS_MISSING';end if;
 -- Same nonce inside one tenant/instance must fail for replay, even if
 -- the claimed execution, event status or digest changes.
 begin
  insert into private.atlas_automation_callback_receipts
    (workspace_id,instance_id,execution_id,nonce,key_id,body_sha256,reported_status,event_at)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'aaaaaaaa-0000-4000-8000-000000000001',
     'aaaa1000-0000-4000-8000-000000000001',
     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','sandbox-v1',repeat('f',64),'error',now());
  raise exception 'N8N_CALLBACK_REPLAY_ACCEPTED';
 exception when unique_violation then null;end;
 -- Two tenants cannot bind the same execution even if remote n8n IDs collide.
 begin
  insert into private.atlas_automation_callback_receipts
    (workspace_id,instance_id,execution_id,nonce,key_id,body_sha256,reported_status,event_at)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'aaaaaaaa-0000-4000-8000-000000000001',
     'bbbb1000-0000-4000-8000-000000000001',
     'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','sandbox-v1',repeat('c',64),'success',now());
  raise exception 'N8N_CALLBACK_CROSS_TENANT_EXECUTION_ACCEPTED';
 exception when foreign_key_violation then null;end;
 -- Received nonce does not imply status mutation.
 if not exists(select 1 from public.atlas_automation_executions
   where id='aaaa1000-0000-4000-8000-000000000001' and event_version=0)
 then raise exception 'N8N_CALLBACK_CHANGED_EXECUTION';end if;
 -- Later worker must use a CAS event_version, never blind updates.
 update public.atlas_automation_executions set event_version=event_version+1
 where id='aaaa1000-0000-4000-8000-000000000001' and event_version=0;
 if not found then raise exception 'N8N_CALLBACK_CAS_INITIAL_FAILED';end if;
 update public.atlas_automation_executions set event_version=event_version+1
 where id='aaaa1000-0000-4000-8000-000000000001' and event_version=0;
 if found then raise exception 'N8N_CALLBACK_STALE_CAS_ACCEPTED';end if;
end $$;
reset role;
-- Nobody in browser role may read or write private receipts.
set role authenticated;
do $$
begin
 begin
  perform 1 from private.atlas_automation_callback_receipts;
  raise exception 'N8N_CALLBACK_CLIENT_READ_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  insert into private.atlas_automation_callback_receipts
    (workspace_id,instance_id,execution_id,nonce,key_id,body_sha256,reported_status,event_at)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'aaaaaaaa-0000-4000-8000-000000000001',
     'aaaa1000-0000-4000-8000-000000000001',
     'cccccccccccccccccccccccccccccccc','sandbox-v1',repeat('d',64),'success',now());
  raise exception 'N8N_CALLBACK_CLIENT_WRITE_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
