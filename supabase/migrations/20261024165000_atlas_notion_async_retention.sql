-- SHA-141: bounded retention for terminal Notion async-task metadata.
-- Source only. This does not schedule cleanup or activate a worker.
-- Active/queued jobs and provider results are never touched by this RPC.
create function public.atlas_notion_purge_terminal_async_jobs(
  p_retention_days integer default 30,
  p_limit integer default 250
) returns integer language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare deleted_count integer;
begin
  if p_retention_days is null or p_retention_days not between 1 and 90
    or p_limit is null or p_limit not between 1 and 1000
  then return null; end if;

  delete from public.atlas_notion_async_jobs j
  where j.id in (
    select candidate.id
    from public.atlas_notion_async_jobs candidate
    where candidate.status in ('succeeded','dead')
      and candidate.completed_at is not null
      and candidate.completed_at < clock_timestamp()
        - make_interval(days=>p_retention_days)
    order by candidate.completed_at,candidate.id
    limit p_limit
  );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

revoke all on function public.atlas_notion_purge_terminal_async_jobs(integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_purge_terminal_async_jobs(integer,integer)
  to service_role;
