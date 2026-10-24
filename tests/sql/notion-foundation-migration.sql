-- This entire script runs against disposable PostgreSQL only.
do $$
declare tbl text; role_name text;
begin
  foreach tbl in array array['atlas_notion_oauth_states', 'atlas_notion_connections'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || tbl)::regclass)
      then raise exception 'RLS disabled: %', tbl; end if;
    if (select count(*) from pg_policies where schemaname='public' and tablename=tbl) <> 0
      then raise exception 'Unexpected browser policies: %', tbl; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name::name, ('public.' || tbl)::regclass, 'SELECT') or
         has_table_privilege(role_name::name, ('public.' || tbl)::regclass, 'INSERT') or
         has_table_privilege(role_name::name, ('public.' || tbl)::regclass, 'UPDATE') or
         has_table_privilege(role_name::name, ('public.' || tbl)::regclass, 'DELETE')
        then raise exception 'Browser can reach %: %', tbl,role_name; end if;
    end loop;
    if not has_table_privilege('service_role',('public.' || tbl)::regclass,'SELECT') or
       not has_table_privilege('service_role',('public.' || tbl)::regclass,'INSERT') or
       not has_table_privilege('service_role',('public.' || tbl)::regclass,'UPDATE')
      then raise exception 'Server-only grants absent: %',tbl; end if;
  end loop;
  if has_table_privilege('authenticated','public.atlas_connections','UPDATE') or
     has_table_privilege('authenticated','public.atlas_connections','INSERT') or
     has_table_privilege('authenticated','public.atlas_connections','DELETE')
    then raise exception 'Client can forge connection rows'; end if;
  if not has_table_privilege('authenticated','public.atlas_connections','SELECT') or
     not has_column_privilege('authenticated','public.atlas_connections','account_label','UPDATE') or
     has_column_privilege('authenticated','public.atlas_connections','status','UPDATE') or
     has_column_privilege('authenticated','public.atlas_connections','capabilities','UPDATE') or
     has_column_privilege('authenticated','public.atlas_connections','granted_scopes','UPDATE') or
     has_column_privilege('authenticated','public.atlas_connections','secret_ref','UPDATE') or
     has_column_privilege('authenticated','public.atlas_connections','workspace_id','UPDATE')
    then raise exception 'Generic registry grants are too broad or too restrictive'; end if;
  foreach tbl in array array['atlas_provider_objects', 'atlas_sync_cursors'] loop
    if has_table_privilege('authenticated',('public.' || tbl)::regclass,'UPDATE') or
       has_table_privilege('authenticated',('public.' || tbl)::regclass,'INSERT') or
       has_table_privilege('authenticated',('public.' || tbl)::regclass,'DELETE')
      then raise exception 'Browser can forge source-derived resources: %',tbl; end if;
  end loop;
end $$;

-- Server-only test fixtures: synthetic IDs and ciphertext, NOT real credentials.
insert into public.atlas_connections(id, owner_id, workspace_id, provider, account_label)
values ('123e4567-e89b-12d3-a456-426614174001',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'notion','Test workspace');
insert into public.atlas_notion_connections (
  connection_id, workspace_id, user_id, notion_workspace_id, notion_bot_id,
  token_key_id, access_nonce, access_ciphertext, access_tag
) values (
  '123e4567-e89b-12d3-a456-426614174001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA'
);
do $$
begin
  begin
    insert into public.atlas_connections(id, owner_id, workspace_id, provider, account_label)
    values ('123e4567-e89b-12d3-a456-426614174002',
            '22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','notion','Cross tenant');
    raise exception 'Cross tenant registry binding accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.atlas_notion_connections (
      connection_id, workspace_id, user_id, notion_workspace_id, notion_bot_id,
      token_key_id, access_nonce, access_ciphertext, access_tag
    ) values (
      '123e4567-e89b-12d3-a456-426614174001',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA'
    );
    raise exception 'Mismatched vault binding accepted';
  exception when unique_violation or foreign_key_violation then null;
  end;
end $$;

insert into public.atlas_notion_oauth_states
  (state_hash,workspace_id,user_id,expires_at)
values (repeat('c',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',now()+interval '10 minutes');
do $$
declare affected integer;
begin
  update public.atlas_notion_oauth_states set consumed_at=now()
    where state_hash=repeat('c',64)
      and workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id='22222222-2222-4222-8222-222222222222'
      and consumed_at is null and expires_at>now();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'OAuth state cross-actor consume accepted'; end if;
  update public.atlas_notion_oauth_states set consumed_at=now()
    where state_hash=repeat('c',64)
      and workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and user_id='11111111-1111-4111-8111-111111111111'
      and consumed_at is null and expires_at>now();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Valid state not consumed'; end if;
  update public.atlas_notion_oauth_states set consumed_at=now()
    where state_hash=repeat('c',64) and consumed_at is null;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'OAuth state replay accepted'; end if;
end $$;
