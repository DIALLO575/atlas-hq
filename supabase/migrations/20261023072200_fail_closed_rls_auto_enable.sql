-- Replace the auto-enable function that caught every exception and merely logged
-- it. A failed RLS enable must abort CREATE TABLE and roll back.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare
  cmd record;
  tbl name;
begin
  for cmd in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      select c.relname into tbl from pg_catalog.pg_class c where c.oid = cmd.objid;
      execute pg_catalog.format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
      raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
    else
      raise log 'rls_auto_enable: skip % (schema: %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_event_trigger e
    join pg_catalog.pg_proc p on p.oid = e.evtfoid
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where e.evtname = 'ensure_rls'
      and e.evtevent = 'ddl_command_end'
      and e.evttags @> array['CREATE TABLE']::text[]
      and n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  ) then
    raise exception 'Expected ensure_rls event trigger is missing or misconfigured';
  end if;
end;
$$;
