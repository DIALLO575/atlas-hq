do $$
declare
  rls_enabled boolean;
  policy_count integer;
  role_name text;
begin
  select relrowsecurity into rls_enabled
    from pg_class where oid = 'public.atlas_linear_connections'::regclass;
  if rls_enabled is distinct from true then raise exception 'Connection RLS is not enabled'; end if;

  select count(*) into policy_count from pg_policies
    where schemaname = 'public' and tablename = 'atlas_linear_connections';
  if policy_count <> 0 then raise exception 'Unexpected client policy on encrypted connection table'; end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'SELECT') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'INSERT') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'UPDATE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'DELETE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'TRUNCATE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'REFERENCES') or
       has_table_privilege(role_name::name, 'public.atlas_linear_connections', 'TRIGGER') then
      raise exception 'Client/public role % has connection-table access', role_name;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.atlas_linear_connections', 'SELECT') or
     not has_table_privilege('service_role', 'public.atlas_linear_connections', 'INSERT') or
     not has_table_privilege('service_role', 'public.atlas_linear_connections', 'UPDATE') or
     has_table_privilege('service_role', 'public.atlas_linear_connections', 'DELETE') or
     has_table_privilege('service_role', 'public.atlas_linear_connections', 'TRUNCATE') or
     has_table_privilege('service_role', 'public.atlas_linear_connections', 'REFERENCES') or
     has_table_privilege('service_role', 'public.atlas_linear_connections', 'TRIGGER') then
    raise exception 'Server-only table grants do not match contract';
  end if;

  if has_function_privilege('anon', 'public.atlas_linear_save_connection(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone,integer)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_save_connection(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone,integer)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_save_connection(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone,integer)', 'EXECUTE') then
    raise exception 'Save RPC grants do not match server-only contract';
  end if;
  if has_function_privilege('anon', 'public.atlas_linear_revoke_connection(uuid,uuid,integer)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_revoke_connection(uuid,uuid,integer)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_revoke_connection(uuid,uuid,integer)', 'EXECUTE') then
    raise exception 'Revoke RPC grants do not match server-only contract';
  end if;
  if has_function_privilege('anon', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') then
    raise exception 'Refresh gate RPC grants do not match server-only contract';
  end if;
end $$;

set role service_role;

-- Insert a single actor-specific connection. The payload values are test fixtures,
-- not provider tokens, and this database exists only in the ephemeral CI service.
do $$
declare saved integer;
begin
  saved := public.atlas_linear_save_connection(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'test-v1', 'MDAwMDAwMDAwMDAw', 'Y2lwaGVydGV4dA', 'AAAAAAAAAAAAAAAAAAAAAA',
    'MDAwMDAwMDAwMDAx', 'cmVmcmVzaGNpcGhlcg', 'AAAAAAAAAAAAAAAAAAAAAA',
    array['read']::text[], now() + interval '30 seconds', null
  );
  if saved <> 1 then raise exception 'First actor connection did not insert'; end if;
  if exists (select 1 from public.atlas_linear_connections where access_ciphertext = 'access-token-fixture') then
    raise exception 'Raw token fixture found in ciphertext column';
  end if;

  -- A different user cannot be bound to another workspace without a matching
  -- workspace_members row (composite FK enforcement).
  begin
    perform public.atlas_linear_save_connection(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'test-v1', 'MDAwMDAwMDAwMDAw', 'Y2lwaGVydGV4dA', 'AAAAAAAAAAAAAAAAAAAAAA',
      'MDAwMDAwMDAwMDAx', 'cmVmcmVzaGNpcGhlcg', 'AAAAAAAAAAAAAAAAAAAAAA',
      array['read']::text[], now() + interval '1 day', null
    );
    raise exception 'Cross-workspace actor unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;

  if not public.atlas_linear_claim_refresh(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ) then raise exception 'Expected expired connection to acquire the durable refresh gate'; end if;
  if public.atlas_linear_claim_refresh(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ) then raise exception 'A second refresh process acquired an existing durable gate'; end if;
  if public.atlas_linear_save_connection(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'test-v1', 'MDAwMDAwMDAwMDAw', 'Y2lwaGVydGV4dA', 'AAAAAAAAAAAAAAAAAAAAAA',
    'MDAwMDAwMDAwMDAx', 'cmVmcmVzaGNpcGhlcg', 'AAAAAAAAAAAAAAAAAAAAAA',
    array['read']::text[], now() + interval '1 day', 1
  ) is not null then raise exception 'Ordinary CAS write bypassed a pending refresh claim'; end if;

  if public.atlas_linear_complete_refresh(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'test-v2',
    'MDAwMDAwMDAwMDAw', 'Y2lwaGVydGV4dE5ldw', 'AAAAAAAAAAAAAAAAAAAAAA',
    'MDAwMDAwMDAwMDAx', 'cmVmcmVzaGNpcGhlck5ldw', 'AAAAAAAAAAAAAAAAAAAAAA',
    array['read']::text[], now() + interval '1 day'
  ) is distinct from 2 then raise exception 'Claimed refresh did not atomically replace the encrypted token pair'; end if;
  if exists (select 1 from public.atlas_linear_connections where refresh_attempt_id is not null) then
    raise exception 'Successful refresh left a stale refresh gate';
  end if;
  if not exists (select 1 from public.atlas_linear_connections
      where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and user_id = '11111111-1111-4111-8111-111111111111'
        and refresh_completed_attempt_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then
    raise exception 'Refresh completion marker does not bind the exact attempt';
  end if;

  if not public.atlas_linear_revoke_connection(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 2
  ) then raise exception 'Version-matched logical revoke failed'; end if;
  if not exists (select 1 from public.atlas_linear_connections
      where workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and user_id = '11111111-1111-4111-8111-111111111111'
        and revoked_at is not null and version = 3 and refresh_attempt_id is null
        and refresh_completed_attempt_id is null) then
    raise exception 'Revocation was not recorded as a versioned tombstone';
  end if;
  if public.atlas_linear_revoke_connection(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 2
  ) then raise exception 'Stale-version revoke unexpectedly succeeded'; end if;
end $$;
