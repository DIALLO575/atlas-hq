-- SHA-141: first durable circuit-breaker slice. Shared by all workers
-- consuming ATLAS budgets. Unlike a full half-open breaker this uses a
-- conservative 30-second timed open circuit after 3 provider 5xx failures.
alter table public.atlas_notion_rest_budgets
  add column consecutive_failures integer not null default 0
    check (consecutive_failures between 0 and 3),
  add column circuit_open_count bigint not null default 0
    check(circuit_open_count>=0),
  add column provider_success_count bigint not null default 0
    check(provider_success_count>=0);

-- Called by the read-only client after a provider response, NEVER after a
-- timeout/ambiguous network failure with unknown provider outcome.
create function public.atlas_notion_report_rest_outcome(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,
  p_outcome text
) returns boolean language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare active_id uuid; old_failures integer; next_failures integer; t timestamptz;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null
    or p_notion_workspace_id is null or p_expected_version is null
    or p_expected_version < 1 or p_outcome not in ('success','transient')
  then return false; end if;
  select n.connection_id into active_id from public.atlas_notion_connections n
    join public.atlas_connections a on a.id=n.connection_id
      and a.workspace_id=n.workspace_id and a.owner_id=n.user_id
      and a.provider='notion' and a.status='connected'
    join public.workspace_members m on m.workspace_id=n.workspace_id
      and m.user_id=n.user_id and m.role in ('owner','admin')
    where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
      and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
      and n.version=p_expected_version and n.revoked_at is null
      and n.refresh_attempt_id is null
    for update of n;
  if active_id is null then return false; end if;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('workspace',p_notion_workspace_id) on conflict do nothing;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('connection',p_connection_id) on conflict do nothing;
  -- Workspace lock first, matching the existing budget RPC lock order.
  select consecutive_failures into old_failures
    from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=p_notion_workspace_id
    for update;
  t:=clock_timestamp();
  next_failures:=case when p_outcome='success' then 0
    else least(3,old_failures+1) end;
  update public.atlas_notion_rest_budgets set
    consecutive_failures=case when next_failures=3 then 0 else next_failures end,
    provider_success_count=provider_success_count+
      case when p_outcome='success' then 1 else 0 end,
    circuit_open_count=circuit_open_count+
      case when next_failures=3 and p_outcome='transient' then 1 else 0 end,
    cooldown_until=case when next_failures=3 and p_outcome='transient'
      then greatest(cooldown_until,t+interval '30 seconds') else cooldown_until end,
    updated_at=t
    where scope_type='workspace' and scope_id=p_notion_workspace_id;
  perform 1 from public.atlas_notion_rest_budgets
    where scope_type='connection' and scope_id=p_connection_id
    for update;
  update public.atlas_notion_rest_budgets set
    consecutive_failures=case when p_outcome='success' then 0
      else least(3,consecutive_failures+1) end,
    provider_success_count=provider_success_count+
      case when p_outcome='success' then 1 else 0 end,
    updated_at=t
    where scope_type='connection' and scope_id=p_connection_id;
  return true;
end $$;
revoke all on function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text)
  to service_role;
