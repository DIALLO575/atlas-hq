-- SHA-176 PostgreSQL 17 DISPOSABLE only; never run fixture statements in prod.
\set ON_ERROR_STOP on
set role service_role;
do $
declare
  w uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  n uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  m uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
begin
 if not exists(select 1 from pg_constraint
    where conrelid='public.atlas_engine_instances'::regclass
      and conname='atlas_n8n_runtime_offline_only' and contype='c'
      and convalidated)
 then raise exception 'N8N_RELEASE_CONSTRAINT_MISSING';end if;
 if not exists(select 1 from public.atlas_engine_instances
    where id=n and workspace_id=w and engine_key='n8n' and connection_state='offline')
 then raise exception 'N8N_OFFLINE_INSERT_BROKEN';end if;
 begin
  update public.atlas_engine_instances set connection_state='connected' where id=n;
  raise exception 'N8N_SERVICE_ROLE_CONNECTED';
 exception when check_violation then null;end;
 begin
  update public.atlas_engine_instances set connection_state='read-only' where id=n;
  raise exception 'N8N_SERVICE_ROLE_READ_ONLY_CONNECTED';
 exception when check_violation then null;end;
 begin
  update public.atlas_engine_instances set connection_state='suspended' where id=n;
  raise exception 'N8N_UNREVIEWED_SUSPENSION_ALLOWED';
 exception when check_violation then null;end;
 begin
  insert into public.atlas_engine_instances
    (id,workspace_id,created_by,engine_key,label,connection_state)
  values('aaaaaaaa-0000-4000-8000-000000000099',w,
    '11111111-1111-4111-8111-111111111111','n8n','unreviewed','connected');
  raise exception 'N8N_CONNECTED_INSERT_ALLOWED';
 exception when check_violation then null;end;
 -- The defensive restriction must not interfere with an existing engine.
 update public.atlas_engine_instances set connection_state='connected'
  where id=m and engine_key='mausbot';
 if not exists(select 1 from public.atlas_engine_instances
   where id=m and connection_state='connected') then
  raise exception 'MAUSBOT_REGISTRY_STATE_INCORRECTLY_BLOCKED';end if;
 -- This DB test changes only disposable fixture rows; it does NOT mean the
 -- actual MAUSBOT HTTP 423 release gate opens.
 update public.atlas_engine_instances set connection_state='offline' where id=m;
end $;
reset role;
