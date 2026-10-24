-- SHA-141 distributed REST budgeting, disposable PostgreSQL only.
do $$
begin
  if not (select relrowsecurity from pg_class
     where oid='public.atlas_notion_rest_budgets'::regclass)
  then raise exception 'Budget table RLS disabled'; end if;
  if has_table_privilege('anon','public.atlas_notion_rest_budgets','SELECT')
    or has_table_privilege('authenticated','public.atlas_notion_rest_budgets','SELECT')
    or has_table_privilege('authenticated','public.atlas_notion_rest_budgets','INSERT')
    or not has_table_privilege('service_role','public.atlas_notion_rest_budgets','SELECT')
  then raise exception 'Budget table grants are unsafe'; end if;
  if has_function_privilege('anon',
    'public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated',
    'public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)','EXECUTE')
    or not has_function_privilege('service_role',
    'public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated',
    'public.atlas_notion_cooldown_rest_read(uuid,uuid,uuid,uuid,integer,integer)','EXECUTE')
  then raise exception 'Distributed RPC grants are unsafe'; end if;
end $$;
set role service_role;
do $$
declare
  cid uuid := '123e4567-e89b-12d3-a456-426614174029';
  ws uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  actor uuid := '11111111-1111-4111-8111-111111111111';
  other uuid := '22222222-2222-4222-8222-222222222222';
  notion_ws uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee29';
  bot uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd29';
  v integer; first_slot integer; next_slot integer; rejected integer;
begin
  if public.atlas_notion_store_connection(
    cid,ws,actor,notion_ws,bot,'Budget test',
    'testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA',
    'AAAAAAAAAAAAAAAAAAAAAA',
    'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA'
  ) is distinct from cid then raise exception 'Budget fixture not stored'; end if;
  select version into v from public.atlas_notion_connections
    where connection_id=cid;
  if v<>1 then raise exception 'Unexpected connection version'; end if;
  if public.atlas_notion_reserve_rest_read(cid,ws,other,notion_ws,v,3000)
    is not null then raise exception 'Cross-actor reservation granted'; end if;
  if public.atlas_notion_reserve_rest_read(cid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor,notion_ws,v,3000)
    is not null then raise exception 'Cross-workspace reservation granted'; end if;
  if public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v+1,3000)
    is not null then raise exception 'Stale credential version granted'; end if;
  first_slot := public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v,3000);
  next_slot := public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v,3000);
  if first_slot is null or next_slot is null or first_slot<0 or next_slot<200
    then raise exception 'No shared serialization %, %',first_slot,next_slot; end if;
  if not public.atlas_notion_cooldown_rest_read(cid,ws,actor,notion_ws,v,12)
    then raise exception 'Cannot publish cooldown'; end if;
  rejected := public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v,3000);
  if rejected >= 0 or rejected > -8
    then raise exception 'Long cooldown did not defer: %',rejected; end if;
  if public.atlas_notion_cooldown_rest_read(cid,ws,other,notion_ws,v,10)
    then raise exception 'Cross-actor cooldown accepted'; end if;
  if public.atlas_notion_cooldown_rest_read(cid,ws,actor,notion_ws,v,3601)
    then raise exception 'Unbounded cooldown accepted'; end if;
  if exists(select 1 from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=notion_ws
      and (reserved_count<>2 or throttled_count<>1))
    then raise exception 'Shared rate metrics invalid'; end if;
  -- A claimed token rotation makes budget reads fail closed.
  if not public.atlas_notion_claim_refresh(
    cid,ws,actor,v,'66666666-6666-4666-8666-666666666629')
    then raise exception 'Refresh gate failed'; end if;
  if public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v,3000)
    is not null then raise exception 'Budget allowed refreshing credential'; end if;
  if not public.atlas_notion_fail_refresh(
    cid,ws,actor,v,'66666666-6666-4666-8666-666666666629')
    then raise exception 'Refresh fail-closed fixture did not finalize'; end if;
  if public.atlas_notion_reserve_rest_read(cid,ws,actor,notion_ws,v,3000)
    is not null then raise exception 'Budget allowed revoked credential'; end if;
end $$;
reset role;
