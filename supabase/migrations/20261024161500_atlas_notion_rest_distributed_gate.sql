-- SHA-141: distributed REST admission and cooldown, source only.
-- NOT applied to official ATLAS Supabase; tested on disposable PostgreSQL.
-- Historic statistics are counters, NOT page content, secrets or an async queue.
create table public.atlas_notion_rest_budgets (
  scope_type text not null check (scope_type in ('workspace','connection')),
  scope_id uuid not null,
  next_slot_at timestamptz not null default '-infinity'::timestamptz,
  cooldown_until timestamptz not null default '-infinity'::timestamptz,
  reserved_count bigint not null default 0 check(reserved_count >= 0),
  deferred_count bigint not null default 0 check(deferred_count >= 0),
  throttled_count bigint not null default 0 check(throttled_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(scope_type,scope_id)
);
alter table public.atlas_notion_rest_budgets enable row level security;
revoke all on table public.atlas_notion_rest_budgets
  from public,anon,authenticated,service_role;
grant select,insert,update on public.atlas_notion_rest_budgets to service_role;

-- The service role is the only invoker. Exact connection version + live admin
-- membership + active registry checked atomically; serialize with revoke
-- and OAuth token refresh via FOR UPDATE OF n. All processes share these rows.
-- Return milliseconds until admitted; negative CEIL seconds if deferred;
-- NULL means denied/invalid and MUST fail closed.
create function public.atlas_notion_reserve_rest_read(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,
  p_max_wait_ms integer default 3000
) returns integer language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  found_id uuid;
  current_at timestamptz;
  ws_next timestamptz;
  ws_cool timestamptz;
  conn_next timestamptz;
  conn_cool timestamptz;
  due_at timestamptz;
  delay_ms integer;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null or
     p_notion_workspace_id is null or p_expected_version is null or
     p_expected_version < 1 or p_max_wait_ms not between 0 and 3000 then
    return null;
  end if;
  select n.connection_id into found_id
  from public.atlas_notion_connections n
  join public.atlas_connections a
    on a.id=n.connection_id and a.workspace_id=n.workspace_id and
      a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
  join public.workspace_members m
    on m.workspace_id=n.workspace_id and m.user_id=n.user_id and
      m.role in ('owner','admin')
  where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
    and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
    and n.version=p_expected_version and n.revoked_at is null
    and n.refresh_attempt_id is null
  for update of n;
  if found_id is null then return null; end if;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('workspace',p_notion_workspace_id) on conflict do nothing;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('connection',p_connection_id) on conflict do nothing;
  select next_slot_at,cooldown_until into ws_next,ws_cool
    from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=p_notion_workspace_id
    for update;
  select next_slot_at,cooldown_until into conn_next,conn_cool
    from public.atlas_notion_rest_budgets
    where scope_type='connection' and scope_id=p_connection_id
    for update;
  current_at := clock_timestamp();
  due_at := greatest(current_at,ws_next,ws_cool,conn_next,conn_cool);
  delay_ms := greatest(0,ceil(extract(epoch from due_at-current_at)*1000)::integer);
  if delay_ms > p_max_wait_ms then
    update public.atlas_notion_rest_budgets
      set deferred_count=deferred_count+1,updated_at=current_at
      where scope_type='connection' and scope_id=p_connection_id;
    return -greatest(1,ceil(delay_ms/1000.0)::integer);
  end if;
  update public.atlas_notion_rest_budgets
    set next_slot_at=due_at+interval '350 milliseconds',
        reserved_count=reserved_count+1,updated_at=current_at
    where (scope_type='workspace' and scope_id=p_notion_workspace_id)
       or (scope_type='connection' and scope_id=p_connection_id);
  return delay_ms;
end $$;
revoke all on function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  to service_role;

-- Provider 429/529 cooldown is shared by *every* instance and connection
-- under the affected Notion workspace. Unknown Retry-After uses 1 second.
create function public.atlas_notion_cooldown_rest_read(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,
  p_retry_after_seconds integer default null
) returns boolean language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare found_id uuid; until_at timestamptz;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null or
     p_notion_workspace_id is null or p_expected_version is null or
     p_expected_version < 1 or
     (p_retry_after_seconds is not null and
       p_retry_after_seconds not between 0 and 3600) then return false; end if;
  select n.connection_id into found_id from public.atlas_notion_connections n
    join public.atlas_connections a
      on a.id=n.connection_id and a.workspace_id=n.workspace_id
        and a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
    join public.workspace_members m on m.workspace_id=n.workspace_id
      and m.user_id=n.user_id and m.role in ('owner','admin')
    where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
      and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
      and n.version=p_expected_version and n.revoked_at is null
      and n.refresh_attempt_id is null
    for update of n;
  if found_id is null then return false; end if;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('workspace',p_notion_workspace_id) on conflict do nothing;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('connection',p_connection_id) on conflict do nothing;
  until_at := clock_timestamp() +
    make_interval(secs=>coalesce(p_retry_after_seconds,1));
  -- Deterministic locking: workspace first, connection second (same as reserve).
  perform 1 from public.atlas_notion_rest_budgets
    where scope_type='workspace' and scope_id=p_notion_workspace_id for update;
  update public.atlas_notion_rest_budgets
    set cooldown_until=greatest(cooldown_until,until_at),
      throttled_count=throttled_count+1,updated_at=clock_timestamp()
    where scope_type='workspace' and scope_id=p_notion_workspace_id;
  perform 1 from public.atlas_notion_rest_budgets
    where scope_type='connection' and scope_id=p_connection_id for update;
  update public.atlas_notion_rest_budgets
    set cooldown_until=greatest(cooldown_until,until_at),
      throttled_count=throttled_count+1,updated_at=clock_timestamp()
    where scope_type='connection' and scope_id=p_connection_id;
  return true;
end $$;
revoke all on function public.atlas_notion_cooldown_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_cooldown_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  to service_role;
