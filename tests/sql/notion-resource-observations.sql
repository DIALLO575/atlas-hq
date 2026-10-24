-- SHA-135: disposable PostgreSQL only, called after all Notion base tests.
do $$
declare f text;
begin
  if not (select relrowsecurity from pg_class
     where oid='public.atlas_notion_resource_observations'::regclass)
  then raise exception 'Observation RLS disabled'; end if;
  if (select count(*) from pg_policies where schemaname='public'
    and tablename='atlas_notion_resource_observations') <> 0
  then raise exception 'Unexpected observation policy'; end if;
  foreach f in array array[
    'public.atlas_notion_record_resource_observation(uuid,uuid,uuid,uuid,integer,text,uuid,timestamptz)',
    'public.atlas_notion_list_resource_observations(uuid,uuid,integer)',
    'public.atlas_notion_clear_resource_observations()'
  ] loop
    if has_function_privilege('anon',f,'EXECUTE') or
       has_function_privilege('authenticated',f,'EXECUTE') or
       not has_function_privilege('service_role',f,'EXECUTE')
    then raise exception 'Unprotected observation function: %', f; end if;
  end loop;
  if has_table_privilege('anon','public.atlas_notion_resource_observations','SELECT')
    or has_table_privilege('authenticated','public.atlas_notion_resource_observations','SELECT')
    or has_table_privilege('authenticated','public.atlas_notion_resource_observations','INSERT')
    or not has_table_privilege('service_role','public.atlas_notion_resource_observations','SELECT')
  then raise exception 'Observation grants unsafe'; end if;
end $$;
set role service_role;
do $$
declare cid uuid := '123e4567-e89b-12d3-a456-426614174010';
  ws uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  actor uuid := '11111111-1111-4111-8111-111111111111';
  other uuid := '22222222-2222-4222-8222-222222222222';
  nw uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee10';
  bot uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff0';
  obj uuid := '55555555-5555-4555-8555-555555555555';
  wrote boolean;
  current_version integer;
begin
  if public.atlas_notion_store_connection(cid,ws,actor,nw,bot,
    'Observations','testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA',
    'AAAAAAAAAAAAAAAAAAAAAA', 'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg',
    'AAAAAAAAAAAAAAAAAAAAAA') is distinct from cid
  then raise exception 'Observation fixture creation failed'; end if;
  select version into current_version from public.atlas_notion_connections
  where connection_id=cid;
  if current_version <> 1 then raise exception 'Unexpected version'; end if;
  wrote:=public.atlas_notion_record_resource_observation(
    cid,ws,other,nw,1,'page',obj,now());
  if wrote then raise exception 'Cross actor observation accepted'; end if;
  wrote:=public.atlas_notion_record_resource_observation(
    cid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor,nw,1,'page',obj,now());
  if wrote then raise exception 'Cross workspace observation accepted'; end if;
  wrote:=public.atlas_notion_record_resource_observation(
    cid,ws,actor,nw,2,'page',obj,now());
  if wrote then raise exception 'Stale/wrong credential version accepted'; end if;
  wrote:=public.atlas_notion_record_resource_observation(
    cid,ws,actor,nw,1,'unknown',obj,now());
  if wrote then raise exception 'Unapproved kind accepted'; end if;
  wrote:=public.atlas_notion_record_resource_observation(
    cid,ws,actor,nw,1,'page',obj,'2026-10-24T12:00:00Z');
  if not wrote then raise exception 'Valid observation rejected'; end if;
  if (select count(*) from public.atlas_notion_list_resource_observations(ws,actor,10)) <> 1
    or (select count(*) from public.atlas_notion_list_resource_observations(ws,other,10)) <> 0
    or (select count(*) from public.atlas_notion_list_resource_observations(ws,actor,21)) <> 0
  then raise exception 'Observation listing leaked actor or limit'; end if;
  -- Repeated proof updates one record; no titles or page payload stored.
  wrote:=public.atlas_notion_record_resource_observation(
    cid,ws,actor,nw,1,'page',obj,'2026-10-24T13:00:00Z');
  if not wrote or (select count(*) from public.atlas_notion_resource_observations
      where connection_id=cid)<>1 then raise exception 'Upsert did not deduplicate'; end if;
  if not exists(select 1 from public.atlas_notion_resource_observations
     where connection_id=cid and source_updated_at='2026-10-24T13:00:00Z')
  then raise exception 'Provenance version not updated'; end if;
  -- Claiming refresh invalidates list immediately, without granting access.
  if not public.atlas_notion_claim_refresh(cid,ws,actor,1,
    '66666666-6666-4666-8666-666666666666')
  then raise exception 'Refresh claim unavailable'; end if;
  if (select count(*) from public.atlas_notion_list_resource_observations(ws,actor,10)) <> 0
  then raise exception 'Refresh claim did not hide observations'; end if;
  if public.atlas_notion_record_resource_observation(cid,ws,actor,nw,1,'page',obj,now())
  then raise exception 'Observation saved during refresh'; end if;
  if not public.atlas_notion_fail_refresh(cid,ws,actor,1,
    '66666666-6666-4666-8666-666666666666')
  then raise exception 'Fail-close tombstone did not succeed'; end if;
  if exists(select 1 from public.atlas_notion_resource_observations where connection_id=cid)
  then raise exception 'Revocation trigger did not delete observations'; end if;
  if (select count(*) from public.atlas_notion_list_resource_observations(ws,actor,10)) <> 0
  then raise exception 'Revocation leaked observation'; end if;
end $$;
reset role;
