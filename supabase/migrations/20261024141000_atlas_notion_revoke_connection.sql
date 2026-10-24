-- SHA-122/123: a local disconnect is atomic and wins before any provider revocation.
-- Version-checked, user/workspace-scoped, callable only by service_role.
create or replace function public.atlas_notion_revoke_connection(
  p_connection_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null or
     p_expected_version is null or p_expected_version < 1 or
     not exists (
       select 1 from public.workspace_members
       where workspace_id = p_workspace_id and user_id = p_user_id
         and role in ('owner','admin')
     ) then return false; end if;
  update public.atlas_notion_connections set
    revoked_at = now(), version = version+1, updated_at = now()
  where connection_id = p_connection_id and workspace_id = p_workspace_id
    and user_id = p_user_id and version = p_expected_version
    and revoked_at is null;
  if not found then return false; end if;
  update public.atlas_connections set
    status = 'disconnected', updated_at = now(), checked_at = now()
  where id = p_connection_id and workspace_id = p_workspace_id
    and owner_id = p_user_id and provider = 'notion'
    and status = 'connected';
  if not found then raise exception 'NOTION_REGISTRY_BINDING_INVALID'; end if;
  return true;
end;
$$;
revoke all on function public.atlas_notion_revoke_connection(uuid,uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_notion_revoke_connection(uuid,uuid,uuid,integer)
  to service_role;
