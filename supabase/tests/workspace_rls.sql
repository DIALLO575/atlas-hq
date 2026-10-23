-- Run with `supabase test db` against a disposable/local Supabase database.
begin;

insert into auth.users (id, aud, role, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.test')
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by)
values
  ('a1000000-0000-4000-8000-000000000011', 'User A workspace', 'a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000022', 'User B workspace', 'b2000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare visible_count integer;
declare visible_membership_count integer;
begin
  select count(*) into visible_count from public.workspaces;
  select count(*) into visible_membership_count from public.workspace_members;
  if visible_count <> 1 or not exists (
    select 1 from public.workspaces where id = 'a1000000-0000-4000-8000-000000000011'
  ) or exists (
    select 1 from public.workspaces where id = 'b2000000-0000-4000-8000-000000000022'
  ) or visible_membership_count <> 1 then raise exception 'User A workspace isolation failed'; end if;

  begin
    insert into public.workspaces (name, created_by)
    values ('forged owner', 'b2000000-0000-4000-8000-000000000002');
    raise exception 'Forged created_by was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000001', 'admin');
    raise exception 'Cross-tenant membership write was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.workspaces
    set created_by = 'b2000000-0000-4000-8000-000000000002'
    where id = 'a1000000-0000-4000-8000-000000000011';
    raise exception 'Workspace created_by was mutable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare visible_count integer;
declare visible_membership_count integer;
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
declare function_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.rls_auto_enable()'::regprocedure) into function_definition;
  if function_definition ilike '%when others%' or function_definition ilike '%failed to enable rls%' then
    raise exception 'RLS auto-enable still swallows failures';
  end if;
  if not exists (select 1 from pg_catalog.pg_event_trigger where evtname = 'ensure_rls') then
    raise exception 'RLS auto-enable event trigger is missing';
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
