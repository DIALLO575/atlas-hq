-- Run with `supabase test db` against a disposable/local Supabase database.
begin;

insert into auth.users (id, aud, role, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.test'),
  ('c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rls-c@example.test'),
  ('d4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'rls-d@example.test')
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by)
values
  ('a1000000-0000-4000-8000-000000000011', 'User A workspace', 'a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000022', 'User B workspace', 'b2000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  visible_count integer;
  visible_membership_count integer;
  changed_count integer;
  privilege text;
begin
  select count(*) into visible_count from public.workspaces;
  select count(*) into visible_membership_count from public.workspace_members;
  if visible_count <> 1 or not exists (
    select 1 from public.workspaces where id = 'a1000000-0000-4000-8000-000000000011'
  ) or exists (
    select 1 from public.workspaces where id = 'b2000000-0000-4000-8000-000000000022'
  ) or visible_membership_count <> 1 then raise exception 'User A workspace isolation failed'; end if;

  if not pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'name', 'UPDATE') then
    raise exception 'authenticated cannot update workspaces.name';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'updated_at', 'UPDATE') then
    raise exception 'authenticated cannot update workspaces.updated_at';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.workspaces', 'created_by', 'UPDATE') then
    raise exception 'authenticated can update workspaces.created_by';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'UPDATE') then
    raise exception 'authenticated has table-level UPDATE on workspaces';
  end if;
  foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if pg_catalog.has_table_privilege('anon', 'public.workspaces', privilege) then
      raise exception 'anon has % on workspaces', privilege;
    end if;
    if pg_catalog.has_table_privilege('anon', 'public.workspace_members', privilege) then
      raise exception 'anon has % on workspace_members', privilege;
    end if;
  end loop;
  if not pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.workspaces', 'DELETE') then
    raise exception 'authenticated workspace table privileges are incomplete';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'DELETE') then
    raise exception 'authenticated workspace_members privileges are incomplete';
  end if;
  foreach privilege in array array['UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if pg_catalog.has_table_privilege('authenticated', 'public.workspaces', privilege)
       and privilege <> 'UPDATE' then
      raise exception 'authenticated has unnecessary % on workspaces', privilege;
    end if;
    if pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', privilege) then
      raise exception 'authenticated has unnecessary % on workspace_members', privilege;
    end if;
  end loop;
  if pg_catalog.has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE') then
    raise exception 'authenticated has table-level UPDATE on workspace_members';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid in ('public.workspaces'::regclass, 'public.workspace_members'::regclass)
      and a.attnum > 0 and not a.attisdropped
      and pg_catalog.has_any_column_privilege('anon', a.attrelid, a.attname)
  ) then
    raise exception 'anon has column privileges on workspace tables';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.workspaces'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('name', 'updated_at')
      and pg_catalog.has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
  ) then
    raise exception 'authenticated has UPDATE on a workspace column outside name and updated_at';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.workspace_members'::regclass
      and a.attnum > 0 and not a.attisdropped
      and pg_catalog.has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
  ) then
    raise exception 'authenticated has UPDATE on a workspace_members column';
  end if;

  update public.workspaces
  set name = 'User A renamed workspace', updated_at = now() + interval '1 minute'
  where id = 'a1000000-0000-4000-8000-000000000011';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 or not exists (
    select 1 from public.workspaces
    where id = 'a1000000-0000-4000-8000-000000000011'
      and name = 'User A renamed workspace'
      and created_by = 'a1000000-0000-4000-8000-000000000001'
      and updated_at > now()
  ) then raise exception 'name and updated_at update failed or changed created_by'; end if;

  begin
    update public.workspaces
    set created_by = 'b2000000-0000-4000-8000-000000000002'
    where id = 'a1000000-0000-4000-8000-000000000011';
    raise exception 'Workspace created_by was mutable';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workspaces (name, created_by)
    values ('forged owner', 'b2000000-0000-4000-8000-000000000002');
    raise exception 'Forged created_by was accepted';
  exception when insufficient_privilege then null;
  end;

  -- Owners/admins may nominate another admin in their own workspace.
  insert into public.workspace_members (workspace_id, user_id, role)
  values ('a1000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000003', 'admin');

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('a1000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000004', 'owner');
    raise exception 'Owner role can be granted through membership insert';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000022', 'd4000000-0000-4000-8000-000000000004', 'admin');
    raise exception 'Cross-tenant membership write was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- A workspace admin can invite another admin, but cannot grant owner or write another workspace.
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

do $$
declare
  visible_count integer;
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values ('a1000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000004', 'admin');

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('a1000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000002', 'owner');
    raise exception 'Admin granted the owner role';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000022', 'd4000000-0000-4000-8000-000000000004', 'admin');
    raise exception 'Workspace admin wrote to a different tenant';
  exception when insufficient_privilege then null;
  end;

  select count(*) into visible_count from public.workspaces;
  if visible_count <> 1 or not exists (
    select 1 from public.workspace_members
    where workspace_id = 'a1000000-0000-4000-8000-000000000011'
      and user_id = 'd4000000-0000-4000-8000-000000000004'
      and role = 'admin'
  ) then raise exception 'Admin nomination or workspace isolation failed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare
  visible_count integer;
  visible_membership_count integer;
begin
  select count(*) into visible_count from public.workspaces;
  select count(*) into visible_membership_count from public.workspace_members;
  if visible_count <> 1 or not exists (
    select 1 from public.workspaces where id = 'b2000000-0000-4000-8000-000000000022'
  ) or exists (
    select 1 from public.workspaces where id = 'a1000000-0000-4000-8000-000000000011'
  ) or visible_membership_count <> 1 then raise exception 'User B workspace isolation failed'; end if;
end;
$$;

reset role;

do $$
declare
  function_definition text;
  trigger_tags text[];
begin
  select pg_catalog.pg_get_functiondef('public.rls_auto_enable()'::regprocedure) into function_definition;
  if function_definition ilike '%when others%' or function_definition ilike '%failed to enable rls%' then
    raise exception 'RLS auto-enable still swallows failures';
  end if;
  select evttags into trigger_tags from pg_catalog.pg_event_trigger where evtname = 'ensure_rls';
  if trigger_tags is null or not (trigger_tags @> array['CREATE TABLE']::text[]) then
    raise exception 'RLS auto-enable event trigger is missing or misconfigured';
  end if;

  -- Force a failure inside the trigger. CREATE TABLE must fail and leave no table.
  execute $ddl$
    create or replace function public.rls_auto_enable()
    returns event_trigger language plpgsql security definer set search_path = 'pg_catalog'
    as $body$ begin raise exception 'forced rls_auto_enable failure'; end; $body$
  $ddl$;
  begin
    execute 'create table public.atlas_rls_error_probe (id integer)';
    raise exception 'RLS auto-enable swallowed a failure';
  exception when others then
    if sqlerrm = 'RLS auto-enable swallowed a failure' then raise; end if;
    if sqlerrm <> 'forced rls_auto_enable failure' then raise; end if;
  end;
  execute function_definition;
  if pg_catalog.to_regclass('public.atlas_rls_error_probe') is not null then
    raise exception 'Failed CREATE TABLE left a partial relation';
  end if;
end;
$$;

create table public.atlas_rls_trigger_regression (id integer);
do $$
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.atlas_rls_trigger_regression'::regclass) then
    raise exception 'RLS auto-enable did not protect a new public table';
  end if;
end;
$$;

rollback;
