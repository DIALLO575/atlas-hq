-- Runs against disposable PostgreSQL after both Notion migrations and fixtures.
do $$
declare saved uuid; version_num integer;
begin
  if has_function_privilege('anon',
     'public.atlas_notion_store_connection(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated',
     'public.atlas_notion_store_connection(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role',
     'public.atlas_notion_store_connection(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)','EXECUTE')
  then raise exception 'Notion save RPC has unsafe grants'; end if;
end $$;

set role service_role;
do $$
declare saved uuid; version_num integer;
begin
  -- The fixture created an existing active connection in the earlier test.
  saved := public.atlas_notion_store_connection(
    '123e4567-e89b-12d3-a456-426614174003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Updated name','testkey','MDAwMDAwMDAwMDAw',
    'Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',null,null,null
  );
  if saved <> '123e4567-e89b-12d3-a456-426614174001' then
    raise exception 'OAuth re-authorization duplicated the connection';
  end if;
  select version into version_num from public.atlas_notion_connections
    where connection_id = saved;
  if version_num <> 2 then raise exception 'Token version did not rotate'; end if;

  -- An actor outside the workspace cannot save a provider token.
  if public.atlas_notion_store_connection(
    '123e4567-e89b-12d3-a456-426614174004',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'Forbidden','testkey','MDAwMDAwMDAwMDAw',
    'Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',null,null,null
  ) is not null then raise exception 'Cross-tenant actor saved a Notion token'; end if;
end $$;
reset role;
