-- Disposable PostgreSQL 17 fixture. Runs after linear-oauth-state-fixture.sql.
create schema private;
create function private.is_workspace_member(p_workspace uuid) returns boolean
language sql stable as $$ select exists(select 1 from public.workspace_members m
 where m.workspace_id=p_workspace); $$;
grant select on public.workspace_members to service_role;
