-- SHA-175 disposable PostgreSQL 17 ONLY. Do not run test fixtures in production.
\set ON_ERROR_STOP on

-- Verify SQL grants and RLS before making any test rows.
do $$
declare t text;
begin
 foreach t in array array['atlas_automation_workflows','atlas_automation_executions'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass)
   then raise exception 'N8N_REGISTRY_RLS_DISABLED: %',t;end if;
  if has_table_privilege('anon','public.'||t,'SELECT')
   or has_table_privilege('authenticated','public.'||t,'INSERT')
   or has_table_privilege('authenticated','public.'||t,'UPDATE')
   or has_table_privilege('authenticated','public.'||t,'DELETE')
   then raise exception 'N8N_REGISTRY_CLIENT_WRITE_OR_ANON_READ: %',t;end if;
  if not has_table_privilege('authenticated','public.'||t,'SELECT')
   then raise exception 'N8N_REGISTRY_NO_MEMBER_SELECT: %',t;end if;
 end loop;
 if (select count(*) from pg_policies
    where schemaname='public' and tablename in
      ('atlas_automation_workflows','atlas_automation_executions')
      and cmd='SELECT' and roles @> array['authenticated']) <> 2
 then raise exception 'N8N_REGISTRY_RLS_POLICIES_MISSING';end if;
end $$;

-- n8n tenants A/B, plus non-n8n instance to catch forged provider binding.
insert into public.atlas_engine_instances(id,workspace_id,created_by,engine_key,label)
values
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','n8n','A'),
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','mausbot','A non-n8n'),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','n8n','B');

set role service_role;
insert into public.atlas_automation_workflows
  (id,workspace_id,instance_id,remote_workflow_id,name,sync_state,last_seen_at,remote_active)
values
 ('aaaa0000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
  'same-remote','Tenant A flow','observed',now(),true),
 ('bbbb0000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000001',
  'same-remote','Tenant B flow','observed',now(),false);
insert into public.atlas_automation_executions
 (id,workspace_id,instance_id,workflow_id,remote_execution_id,status)
values
 ('aaaa1000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
  'aaaa0000-0000-4000-8000-000000000001','same-exec','success'),
 ('bbbb1000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000001',
  'bbbb0000-0000-4000-8000-000000000001','same-exec','waiting');

do $$
begin
 -- Duplicate remote IDs are disallowed PER INSTANCE, but may exist in B.
 begin
  insert into public.atlas_automation_workflows
   (workspace_id,instance_id,remote_workflow_id,name)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001','same-remote','duplicate');
  raise exception 'N8N_DUPLICATE_REMOTE_WORKFLOW_ACCEPTED';
 exception when unique_violation then null;end;
 -- Non-n8n instances cannot be registered as automation workflow providers.
 begin
  insert into public.atlas_automation_workflows
   (workspace_id,instance_id,remote_workflow_id,name)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000002','mausbot-workflow','bad');
  raise exception 'N8N_PROVIDER_BINDING_FORGED';
 exception when foreign_key_violation then null;end;
 -- Cross-tenant instance and cross-tenant workflow IDs are blocked.
 begin
  insert into public.atlas_automation_workflows
   (workspace_id,instance_id,remote_workflow_id,name)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-0000-4000-8000-000000000001','foreign','bad');
  raise exception 'N8N_FOREIGN_WORKSPACE_INSTANCE_ACCEPTED';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.atlas_automation_executions
   (workspace_id,instance_id,workflow_id,remote_execution_id)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'bbbb0000-0000-4000-8000-000000000001','foreign');
  raise exception 'N8N_FOREIGN_WORKSPACE_WORKFLOW_ACCEPTED';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.atlas_automation_executions
   (workspace_id,instance_id,workflow_id,remote_execution_id,mission_id)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaa0000-0000-4000-8000-000000000001','foreign-mission',
    'ffffffff-ffff-4fff-8fff-ffffffffffff');
  raise exception 'N8N_FOREIGN_WORKSPACE_MISSION_ACCEPTED';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.atlas_automation_executions
   (workspace_id,instance_id,workflow_id,remote_execution_id)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaa0000-0000-4000-8000-000000000001','same-exec');
  raise exception 'N8N_DUPLICATE_REMOTE_EXECUTION_ACCEPTED';
 exception when unique_violation then null;end;
 -- Autonomous runs are valid with no Atlas mission; existing atlas_engine_runs unchanged.
 if not exists(select 1 from public.atlas_automation_executions
   where id='aaaa1000-0000-4000-8000-000000000001' and mission_id is null)
 then raise exception 'N8N_AUTONOMOUS_MISSION_UNEXPECTED';end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
begin
 if (select count(*) from public.atlas_automation_workflows)<>1 or
   (select count(*) from public.atlas_automation_executions)<>1
 then raise exception 'N8N_TENANT_A_RLS_LEAK';end if;
 begin
  insert into public.atlas_automation_workflows(workspace_id,instance_id,remote_workflow_id,name)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001','client-forged','fake');
  raise exception 'N8N_BROWSER_WORKFLOW_WRITE_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  update public.atlas_automation_executions set status='success';
  raise exception 'N8N_BROWSER_EXECUTION_UPDATE_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
begin
 if (select count(*) from public.atlas_automation_workflows)<>1 or
   (select count(*) from public.atlas_automation_executions)<>1
 then raise exception 'N8N_TENANT_B_RLS_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
begin
 if (select count(*) from public.atlas_automation_workflows)<>1
 then raise exception 'N8N_ADMIN_VISIBILITY_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $$
begin
 if exists(select 1 from public.atlas_automation_workflows)
  or exists(select 1 from public.atlas_automation_executions)
 then raise exception 'N8N_NONMEMBER_RLS_LEAK';end if;
end $$;
reset role;
