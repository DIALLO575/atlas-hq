-- SHA-141 durable queue and breaker, disposable PG17 only.
do $$
declare f text;
begin
  if not (select relrowsecurity from pg_class where
    oid='public.atlas_notion_async_jobs'::regclass)
  then raise exception 'Queue RLS missing'; end if;
  if has_table_privilege('anon','public.atlas_notion_async_jobs','SELECT')
    or has_table_privilege('authenticated','public.atlas_notion_async_jobs','INSERT')
    or not has_table_privilege('service_role','public.atlas_notion_async_jobs','SELECT')
  then raise exception 'Queue grants unsafe'; end if;
  foreach f in array array[
    'public.atlas_notion_enqueue_async_task(uuid,uuid,uuid,uuid,integer,text)',
    'public.atlas_notion_claim_async_task(integer)',
    'public.atlas_notion_finish_async_task(uuid,uuid,text,integer,text)',
    'public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text)',
    'public.atlas_notion_purge_terminal_async_jobs(integer,integer)'
  ] loop
    if has_function_privilege('anon',f,'EXECUTE') or
       has_function_privilege('authenticated',f,'EXECUTE') or
       not has_function_privilege('service_role',f,'EXECUTE')
    then raise exception 'Unprotected RPC %',f; end if;
  end loop;
end $$;
set role service_role;
do $$
declare
  cid uuid:='123e4567-e89b-12d3-a456-426614174041';
  ws uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  actor uuid:='11111111-1111-4111-8111-111111111111';
  other uuid:='22222222-2222-4222-8222-222222222222';
  nw uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeee41';
  bot uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddd41';
  id1 uuid; id2 uuid; lease record; replay record; d integer;
begin
  if public.atlas_notion_store_connection(cid,ws,actor,nw,bot,'async fixture',
    'testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',
    'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA'
  ) is distinct from cid then raise exception 'Async fixture not stored'; end if;
  if public.atlas_notion_enqueue_async_task(cid,ws,other,nw,1,'task_test') is not null
    or public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,2,'task_test') is not null
    or public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,1,'https://evil') is not null
    then raise exception 'Invalid enqueue authorized'; end if;
  id1:=public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,1,'task_test');
  id2:=public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,1,'task_test');
  if id1 is null or id1 is distinct from id2
    then raise exception 'Enqueue idempotence failed'; end if;
  select * into lease from public.atlas_notion_claim_async_task(60);
  if lease.job_id is distinct from id1 or lease.attempt<>1
    then raise exception 'Claim not assigned %',lease.job_id; end if;
  select * into replay from public.atlas_notion_claim_async_task(60);
  if replay.job_id is not null then raise exception 'Double claim while leased'; end if;
  if public.atlas_notion_finish_async_task(id1,
    '99999999-9999-4999-8999-999999999999','succeeded',3,null)
    then raise exception 'Wrong lease finished job'; end if;
  if not public.atlas_notion_finish_async_task(id1,lease.lease_id,'poll_again',1,null)
    then raise exception 'Legitimate poll not rescheduled'; end if;
  if public.atlas_notion_finish_async_task(id1,lease.lease_id,'succeeded',1,null)
    then raise exception 'Old lease accepted twice'; end if;
  update public.atlas_notion_async_jobs set available_at=clock_timestamp()-interval '1 second'
    where id=id1;
  select * into replay from public.atlas_notion_claim_async_task(60);
  if replay.job_id is distinct from id1 or replay.lease_id=lease.lease_id
    then raise exception 'Rescheduled task not reclaimed'; end if;
  update public.atlas_notion_async_jobs set lease_until=clock_timestamp()-interval '1 second'
    where id=id1;
  select * into lease from public.atlas_notion_claim_async_task(60);
  if lease.job_id is distinct from id1 or lease.attempt<>3 then
    raise exception 'Expired lease not recovered'; end if;
  if public.atlas_notion_finish_async_task(id1,replay.lease_id,'succeeded',1,null)
    then raise exception 'Stale lease finished newly claimed job'; end if;
  if not public.atlas_notion_finish_async_task(id1,lease.lease_id,'permanent',1,'provider_failed')
    then raise exception 'Cannot dead-letter failed task'; end if;
  if not exists(select 1 from public.atlas_notion_async_jobs
    where id=id1 and status='dead' and last_error_code='provider_failed')
    then raise exception 'Dead letter not persisted'; end if;
  update public.atlas_notion_async_jobs
    set completed_at=clock_timestamp()-interval '31 days'
    where id=id1;
  if public.atlas_notion_purge_terminal_async_jobs(0,250) is not null
    or public.atlas_notion_purge_terminal_async_jobs(30,0) is not null
    then raise exception 'Invalid retention bounds accepted'; end if;
  if public.atlas_notion_purge_terminal_async_jobs(30,1)<>1
    or exists(select 1 from public.atlas_notion_async_jobs where id=id1)
    then raise exception 'Expired terminal job not purged'; end if;
  if not public.atlas_notion_report_rest_outcome(cid,ws,actor,nw,1,'success')
    then raise exception 'Success not recorded'; end if;
  if public.atlas_notion_report_rest_outcome(cid,ws,other,nw,1,'transient')
    then raise exception 'Cross-actor breaker report succeeded'; end if;
  for d in 1..3 loop
    if not public.atlas_notion_report_rest_outcome(cid,ws,actor,nw,1,'transient')
      then raise exception 'Breaker transient rejected'; end if;
  end loop;
  if not exists(select 1 from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=nw and circuit_open_count=1
      and cooldown_until>clock_timestamp())
    then raise exception 'Circuit did not open after 3 transients'; end if;
  if public.atlas_notion_reserve_rest_read(cid,ws,actor,nw,1,3000) >= 0
    then raise exception 'Open circuit allowed immediate request'; end if;
  if not public.atlas_notion_report_rest_outcome(cid,ws,actor,nw,1,'success')
    then raise exception 'Recovery report rejected'; end if;
  if not exists(select 1 from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=nw
      and consecutive_failures=0 and provider_success_count=2)
    then raise exception 'Circuit recovery metric invalid'; end if;
  id2:=public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,1,'task_to_revoke');
  if id2 is null then raise exception 'Second enqueue failed'; end if;
  if not public.atlas_notion_claim_refresh(cid,ws,actor,1,
    '66666666-6666-4666-8666-666666666641')
    then raise exception 'Refresh not claimed'; end if;
  if public.atlas_notion_enqueue_async_task(cid,ws,actor,nw,1,'task_forbidden') is not null
    then raise exception 'Refresh gate allowed new queue task'; end if;
  if not public.atlas_notion_fail_refresh(cid,ws,actor,1,
    '66666666-6666-4666-8666-666666666641')
    then raise exception 'Fail-closed refresh missing'; end if;
  if exists(select 1 from public.atlas_notion_async_jobs
    where connection_id=cid) then raise exception 'Revoke did not purge queue'; end if;
end $$;
reset role;
