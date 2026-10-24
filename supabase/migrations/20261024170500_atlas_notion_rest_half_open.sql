-- SHA-141: fenced half-open admission with one durable probe per binding.
-- Source-only. No token, provider payload, page data or request log stored.
alter table public.atlas_notion_rest_budgets
  add column circuit_state text not null default 'closed'
    check (circuit_state in ('closed','open','half_open')),
  add column circuit_open_until timestamptz not null default '-infinity'::timestamptz,
  add column half_open_probe_id uuid,
  add column half_open_probe_until timestamptz not null default '-infinity'::timestamptz,
  add constraint notion_half_open_probe_pair check (
    (circuit_state='half_open' and half_open_probe_id is not null)
    or (circuit_state<>'half_open' and half_open_probe_id is null)
  );

update public.atlas_notion_rest_budgets
  set circuit_state='open',circuit_open_until=cooldown_until
  where consecutive_failures=0 and circuit_open_count>0
    and cooldown_until>clock_timestamp();

revoke all on function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
drop function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer);
create function public.atlas_notion_reserve_rest_read(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,p_max_wait_ms integer default 3000
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare found_id uuid; t timestamptz; ws_next timestamptz; conn_next timestamptz;
  ws_cool timestamptz; conn_cool timestamptz; ws_state text; conn_state text;
  ws_open timestamptz; conn_open timestamptz; ws_probe_until timestamptz;
  conn_probe_until timestamptz; due_at timestamptz; delay_ms integer; probe_id uuid;
  probe_ttl constant interval:=interval '5 minutes';
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null or
     p_notion_workspace_id is null or p_expected_version is null or
     p_expected_version<1 or p_max_wait_ms not between 0 and 3000 then return null; end if;
  select n.connection_id into found_id from public.atlas_notion_connections n
    join public.atlas_connections a on a.id=n.connection_id and a.workspace_id=n.workspace_id
      and a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
    join public.workspace_members m on m.workspace_id=n.workspace_id
      and m.user_id=n.user_id and m.role in ('owner','admin')
    where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
      and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
      and n.version=p_expected_version and n.revoked_at is null
      and n.refresh_attempt_id is null for update of n;
  if found_id is null then return null; end if;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('workspace',p_notion_workspace_id) on conflict do nothing;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('connection',p_connection_id) on conflict do nothing;
  select next_slot_at,cooldown_until,circuit_state,circuit_open_until,half_open_probe_until
    into ws_next,ws_cool,ws_state,ws_open,ws_probe_until
    from public.atlas_notion_rest_budgets where scope_type='workspace'
      and scope_id=p_notion_workspace_id for update;
  select next_slot_at,cooldown_until,circuit_state,circuit_open_until,half_open_probe_until
    into conn_next,conn_cool,conn_state,conn_open,conn_probe_until
    from public.atlas_notion_rest_budgets where scope_type='connection'
      and scope_id=p_connection_id for update;
  t:=clock_timestamp();
  if greatest(ws_cool,conn_cool,
      case when ws_state='open' then ws_open else '-infinity'::timestamptz end,
      case when conn_state='open' then conn_open else '-infinity'::timestamptz end)>t then
    due_at:=greatest(ws_cool,conn_cool,ws_open,conn_open);
    update public.atlas_notion_rest_budgets set deferred_count=deferred_count+1,updated_at=t
      where scope_type='connection' and scope_id=p_connection_id;
    return jsonb_build_object('delay_ms',-greatest(1,
      ceil(extract(epoch from due_at-t))::integer),'probe_lease_id',null);
  end if;
  if (ws_state='half_open' and ws_probe_until>t) or
     (conn_state='half_open' and conn_probe_until>t) then
    update public.atlas_notion_rest_budgets set deferred_count=deferred_count+1,updated_at=t
      where scope_type='connection' and scope_id=p_connection_id;
    return jsonb_build_object('delay_ms',-1,'probe_lease_id',null);
  end if;
  due_at:=greatest(t,ws_next,ws_cool,conn_next,conn_cool);
  delay_ms:=greatest(0,ceil(extract(epoch from due_at-t)*1000)::integer);
  if delay_ms>p_max_wait_ms then
    update public.atlas_notion_rest_budgets set deferred_count=deferred_count+1,updated_at=t
      where scope_type='connection' and scope_id=p_connection_id;
    return jsonb_build_object('delay_ms',-greatest(1,ceil(delay_ms/1000.0)::integer),
      'probe_lease_id',null);
  end if;
  -- Create a probe lease only after the request has an admissible slot. A
  -- deferred caller must never leave a durable lease that nobody can report.
  if ws_state<>'closed' or conn_state<>'closed' then
    probe_id:=gen_random_uuid();
    update public.atlas_notion_rest_budgets set circuit_state='half_open',
      half_open_probe_id=probe_id,half_open_probe_until=t+probe_ttl,updated_at=t
      where (scope_type='workspace' and scope_id=p_notion_workspace_id)
         or (scope_type='connection' and scope_id=p_connection_id);
  end if;
  update public.atlas_notion_rest_budgets set next_slot_at=due_at+interval '350 milliseconds',
    reserved_count=reserved_count+1,updated_at=t
    where (scope_type='workspace' and scope_id=p_notion_workspace_id)
       or (scope_type='connection' and scope_id=p_connection_id);
  return jsonb_build_object('delay_ms',delay_ms,'probe_lease_id',probe_id);
end $$;

revoke all on function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
drop function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text);
create function public.atlas_notion_report_rest_outcome(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,p_outcome text,
  p_probe_lease_id uuid default null
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare active_id uuid; ws_fail integer; conn_fail integer; t timestamptz;
  ws_state text; conn_state text; ws_probe uuid; conn_probe uuid;
  ws_probe_until timestamptz; conn_probe_until timestamptz;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null
    or p_notion_workspace_id is null or p_expected_version is null or p_expected_version<1
    or p_outcome not in ('success','transient') then return false; end if;
  select n.connection_id into active_id from public.atlas_notion_connections n
    join public.atlas_connections a on a.id=n.connection_id and a.workspace_id=n.workspace_id
      and a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
    join public.workspace_members m on m.workspace_id=n.workspace_id
      and m.user_id=n.user_id and m.role in ('owner','admin')
    where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
      and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
      and n.version=p_expected_version and n.revoked_at is null
      and n.refresh_attempt_id is null for update of n;
  if active_id is null then return false; end if;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('workspace',p_notion_workspace_id) on conflict do nothing;
  insert into public.atlas_notion_rest_budgets(scope_type,scope_id)
    values('connection',p_connection_id) on conflict do nothing;
  select consecutive_failures,circuit_state,half_open_probe_id,half_open_probe_until
    into ws_fail,ws_state,ws_probe,ws_probe_until
    from public.atlas_notion_rest_budgets where scope_type='workspace'
      and scope_id=p_notion_workspace_id for update;
  select consecutive_failures,circuit_state,half_open_probe_id,half_open_probe_until
    into conn_fail,conn_state,conn_probe,conn_probe_until
    from public.atlas_notion_rest_budgets where scope_type='connection'
      and scope_id=p_connection_id for update;
  if ws_state is null or conn_state is null then return false; end if;
  t:=clock_timestamp();
  if p_probe_lease_id is null then
    if ws_state<>'closed' or conn_state<>'closed' then return false; end if;
  elsif ws_state<>'half_open' or conn_state<>'half_open'
    or ws_probe is distinct from p_probe_lease_id or conn_probe is distinct from p_probe_lease_id
    or ws_probe_until<=t or conn_probe_until<=t then return false;
  end if;
  update public.atlas_notion_rest_budgets set
    consecutive_failures=case when p_outcome='success' then 0
      when p_probe_lease_id is not null then 3 else least(3,ws_fail+1) end,
    provider_success_count=provider_success_count+case when p_outcome='success' then 1 else 0 end,
    circuit_open_count=circuit_open_count+case when p_outcome='transient' and
      (p_probe_lease_id is not null or ws_fail>=2) then 1 else 0 end,
    circuit_state=case when p_outcome='success' then 'closed'
      when p_probe_lease_id is not null or ws_fail>=2 then 'open' else 'closed' end,
    circuit_open_until=case when p_outcome='success' then '-infinity'::timestamptz
      when p_probe_lease_id is not null or ws_fail>=2 then t+interval '30 seconds'
      else circuit_open_until end,
    half_open_probe_id=null,half_open_probe_until='-infinity'::timestamptz,
    cooldown_until=case when p_outcome='transient' and
      (p_probe_lease_id is not null or ws_fail>=2) then greatest(cooldown_until,t+interval '30 seconds')
      else cooldown_until end,updated_at=t
    where scope_type='workspace' and scope_id=p_notion_workspace_id;
  update public.atlas_notion_rest_budgets set
    consecutive_failures=case when p_outcome='success' then 0
      when p_probe_lease_id is not null then 3 else least(3,conn_fail+1) end,
    provider_success_count=provider_success_count+case when p_outcome='success' then 1 else 0 end,
    circuit_open_count=circuit_open_count+case when p_outcome='transient' and
      (p_probe_lease_id is not null or conn_fail>=2) then 1 else 0 end,
    circuit_state=case when p_outcome='success' then 'closed'
      when p_probe_lease_id is not null or conn_fail>=2 then 'open' else 'closed' end,
    circuit_open_until=case when p_outcome='success' then '-infinity'::timestamptz
      when p_probe_lease_id is not null or conn_fail>=2 then t+interval '30 seconds'
      else circuit_open_until end,
    half_open_probe_id=null,half_open_probe_until='-infinity'::timestamptz,
    cooldown_until=case when p_outcome='transient' and
      (p_probe_lease_id is not null or conn_fail>=2) then greatest(cooldown_until,t+interval '30 seconds')
      else cooldown_until end,updated_at=t
    where scope_type='connection' and scope_id=p_connection_id;
  return true;
end $$;

revoke all on function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_reserve_rest_read(uuid,uuid,uuid,uuid,integer,integer)
  to service_role;
revoke all on function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_report_rest_outcome(uuid,uuid,uuid,uuid,integer,text,uuid)
  to service_role;
