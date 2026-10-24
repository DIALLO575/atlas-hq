do $$
declare
  rls_enabled boolean;
  policy_count integer;
  role_name text;
  affected integer;
begin
  select relrowsecurity into rls_enabled
    from pg_class where oid = 'public.atlas_linear_oauth_states'::regclass;
  if rls_enabled is distinct from true then raise exception 'RLS is not enabled'; end if;

  select count(*) into policy_count from pg_policies
    where schemaname = 'public' and tablename = 'atlas_linear_oauth_states';
  if policy_count <> 0 then raise exception 'Unexpected client or public RLS policy'; end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'SELECT') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'INSERT') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'UPDATE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'DELETE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'TRUNCATE') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'REFERENCES') or
       has_table_privilege(role_name::name, 'public.atlas_linear_oauth_states', 'TRIGGER') then
      raise exception 'Browser role % has table privileges', role_name;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.atlas_linear_oauth_states', 'SELECT') or
     not has_table_privilege('service_role', 'public.atlas_linear_oauth_states', 'INSERT') or
     not has_table_privilege('service_role', 'public.atlas_linear_oauth_states', 'UPDATE') or
     has_table_privilege('service_role', 'public.atlas_linear_oauth_states', 'DELETE') then
    raise exception 'Service role grants do not match the server-only ledger contract';
  end if;
end $$;

insert into public.atlas_linear_oauth_states (state_hash, workspace_id, user_id, expires_at)
values
  (repeat('c', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', now() + interval '10 minutes'),
  (repeat('e', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', now() + interval '5 seconds'),
  (repeat('m', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', now() + interval '10 minutes'),
  (repeat('v', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', now() + interval '10 minutes');

do $$
declare affected integer;
begin
  update public.atlas_linear_oauth_states set consumed_at = now()
    where state_hash = repeat('m', 64) and workspace_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and user_id = '11111111-1111-4111-8111-111111111111' and consumed_at is null and expires_at > now();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-workspace state consumption succeeded'; end if;

  update public.atlas_linear_oauth_states set consumed_at = now()
    where state_hash = repeat('m', 64) and workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '22222222-2222-4222-8222-222222222222' and consumed_at is null and expires_at > now();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-actor state consumption succeeded'; end if;

  update public.atlas_linear_oauth_states set consumed_at = now()
    where state_hash = repeat('v', 64) and workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-4111-8111-111111111111' and consumed_at is null and expires_at > now();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Valid state could not be consumed'; end if;
end $$;
