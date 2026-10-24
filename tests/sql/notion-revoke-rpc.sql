-- Disposable PostgreSQL only. Builds on notion-store-rpc.sql test connection.
do $$
begin
  if has_function_privilege('anon',
    'public.atlas_notion_revoke_connection(uuid,uuid,uuid,integer)','EXECUTE') or
     has_function_privilege('authenticated',
    'public.atlas_notion_revoke_connection(uuid,uuid,uuid,integer)','EXECUTE') or
     not has_function_privilege('service_role',
    'public.atlas_notion_revoke_connection(uuid,uuid,uuid,integer)','EXECUTE')
  then raise exception 'Notion revoke function permissions too broad'; end if;
end $$;
set role service_role;
do $$
declare current_version integer; result boolean;
begin
  select version into current_version
  from public.atlas_notion_connections
  where connection_id = '123e4567-e89b-12d3-a456-426614174001';
  if current_version <> 2 then raise exception 'Unexpected starting version'; end if;
  result := public.atlas_notion_revoke_connection(
    '123e4567-e89b-12d3-a456-426614174001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',current_version);
  if result then raise exception 'Cross-actor revoke accepted'; end if;
  result := public.atlas_notion_revoke_connection(
    '123e4567-e89b-12d3-a456-426614174001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',current_version-1);
  if result then raise exception 'Stale-version revoke accepted'; end if;
  result := public.atlas_notion_revoke_connection(
    '123e4567-e89b-12d3-a456-426614174001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',current_version);
  if not result then raise exception 'Current actor was unable to disconnect'; end if;
  if exists (
    select 1 from public.atlas_notion_connections
    where connection_id = '123e4567-e89b-12d3-a456-426614174001'
      and revoked_at is null
  ) or not exists (
    select 1 from public.atlas_connections
    where id = '123e4567-e89b-12d3-a456-426614174001'
      and status = 'disconnected'
  ) then raise exception 'Revocation/registry transaction did not apply'; end if;
  result := public.atlas_notion_revoke_connection(
    '123e4567-e89b-12d3-a456-426614174001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',current_version);
  if result then raise exception 'Duplicate revocation succeeded'; end if;
end $$;
reset role;
