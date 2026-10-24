-- SHA-141: bounded, server-only durable tracking of Notion async_task IDs.
-- Source migration ONLY. No production application or worker activation.
-- Never enqueue a Notion write or persist result/markdown/token/title.
create table public.atlas_notion_async_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.atlas_notion_connections(connection_id)
    on delete cascade,
  workspace_id uuid not null,
  user_id uuid not null,
  notion_workspace_id uuid not null,
  credential_version integer not null check (credential_version > 0),
  provider_task_id text not null check (
    provider_task_id ~ '^task_[A-Za-z0-9_-]{1,128}$'
  ),
  status text not null default 'queued' check (
    status in ('queued','leased','succeeded','dead')
  ),
  attempts integer not null default 0 check (attempts between 0 and 12),
  max_attempts integer not null default 8 check (max_attempts between 1 and 12),
  available_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code in (
    'provider_transient','auth_required','permission_denied','task_not_found',
    'provider_failed','invalid_response','attempts_exhausted','credential_rotated'
  )),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_job_lease_pair check (
    (lease_id is null and lease_until is null and status <> 'leased')
    or (lease_id is not null and lease_until is not null and status = 'leased')
  ),
  constraint notion_job_actor_fk foreign key(workspace_id,user_id)
    references public.workspace_members(workspace_id,user_id) on delete cascade,
  unique (connection_id,credential_version,provider_task_id)
);
create index atlas_notion_async_due_idx on public.atlas_notion_async_jobs
  (available_at,id) where status in ('queued','leased');
alter table public.atlas_notion_async_jobs enable row level security;
revoke all on public.atlas_notion_async_jobs from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.atlas_notion_async_jobs to service_role;

-- Locks personal OAuth row first; never trusts client-declared scopes/grants.
create function public.atlas_notion_enqueue_async_task(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_notion_workspace_id uuid,p_expected_version integer,
  p_provider_task_id text
) returns uuid language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare authorized_id uuid; v_job_id uuid;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null
     or p_notion_workspace_id is null or p_expected_version is null
     or p_expected_version < 1 or p_provider_task_id is null
     or p_provider_task_id !~ '^task_[A-Za-z0-9_-]{1,128}$' then
    return null;
  end if;
  select n.connection_id into authorized_id
  from public.atlas_notion_connections n
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
  if authorized_id is null then return null; end if;
  insert into public.atlas_notion_async_jobs
    (connection_id,workspace_id,user_id,notion_workspace_id,
     credential_version,provider_task_id)
    values (p_connection_id,p_workspace_id,p_user_id,p_notion_workspace_id,
      p_expected_version,p_provider_task_id)
    on conflict (connection_id,credential_version,provider_task_id)
      do update set updated_at=public.atlas_notion_async_jobs.updated_at
    returning id into v_job_id;
  return v_job_id;
end $$;
revoke all on function public.atlas_notion_enqueue_async_task(uuid,uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_enqueue_async_task(uuid,uuid,uuid,uuid,integer,text)
  to service_role;

-- Returns one lease, never credentials or provider task result. Lease duration
-- bounded. Concurrent workers use SKIP LOCKED and cannot claim the same row.
create function public.atlas_notion_claim_async_task(p_lease_seconds integer default 90)
returns table (
  job_id uuid,lease_id uuid,connection_id uuid,workspace_id uuid,
  user_id uuid,notion_workspace_id uuid,credential_version integer,
  provider_task_id text,attempt integer
) language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 120 then
    return;
  end if;
  -- Exhausted crashed lease is a terminal dead-letter, not stuck forever.
  update public.atlas_notion_async_jobs j set status='dead',
    lease_id=null,lease_until=null,last_error_code='attempts_exhausted',
    completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where j.status='leased' and j.lease_until < clock_timestamp()
      and j.attempts >= j.max_attempts;
  return query
    with claimable as (
      select j.id from public.atlas_notion_async_jobs j
      join public.atlas_notion_connections n on n.connection_id=j.connection_id
        and n.workspace_id=j.workspace_id and n.user_id=j.user_id
        and n.notion_workspace_id=j.notion_workspace_id
        and n.version=j.credential_version and n.revoked_at is null
        and n.refresh_attempt_id is null
      join public.atlas_connections a on a.id=n.connection_id
        and a.workspace_id=n.workspace_id and a.owner_id=n.user_id
        and a.provider='notion' and a.status='connected'
      join public.workspace_members m on m.workspace_id=j.workspace_id
        and m.user_id=j.user_id and m.role in ('owner','admin')
      where ((j.status='queued' and j.available_at <= clock_timestamp())
        or (j.status='leased' and j.lease_until < clock_timestamp()))
        and j.attempts < j.max_attempts
      order by j.available_at,j.id
      limit 1 for update of j skip locked
    ), leased as (
      update public.atlas_notion_async_jobs j
      set status='leased',attempts=j.attempts+1,
        lease_id=gen_random_uuid(),
        lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
        updated_at=clock_timestamp()
      from claimable c where j.id=c.id
      returning j.id,j.lease_id,j.connection_id,j.workspace_id,
        j.user_id,j.notion_workspace_id,j.credential_version,
        j.provider_task_id,j.attempts
    )
    select l.id,l.lease_id,l.connection_id,l.workspace_id,
      l.user_id,l.notion_workspace_id,l.credential_version,
      l.provider_task_id,l.attempts from leased l;
end $$;
revoke all on function public.atlas_notion_claim_async_task(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_claim_async_task(integer)
  to service_role;

-- Owner of one exact active lease may finish, reschedule or dead-letter.
-- The result is deliberately metadata-only; never store response.result.
create function public.atlas_notion_finish_async_task(
  p_job_id uuid,p_lease_id uuid,p_outcome text,
  p_delay_seconds integer default 3,p_error_code text default null
) returns boolean language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare j public.atlas_notion_async_jobs%rowtype; next_status text;
begin
  if p_job_id is null or p_lease_id is null or
     p_outcome is null or p_outcome not in
       ('succeeded','poll_again','transient','permanent') or
     p_delay_seconds is null or p_delay_seconds not between 1 and 3600 or
     (p_error_code is not null and p_error_code not in (
       'provider_transient','auth_required','permission_denied','task_not_found',
       'provider_failed','invalid_response','attempts_exhausted','credential_rotated'))
  then return false; end if;
  select * into j from public.atlas_notion_async_jobs
    where id=p_job_id and lease_id=p_lease_id and status='leased'
      and lease_until > clock_timestamp() for update;
  if not found then return false; end if;
  -- A revoked/replaced personal token can never mark an old job successful.
  if not exists(
    select 1 from public.atlas_notion_connections n
    join public.atlas_connections a on a.id=n.connection_id
      and a.workspace_id=n.workspace_id and a.owner_id=n.user_id
      and a.status='connected' and a.provider='notion'
    join public.workspace_members m on m.workspace_id=n.workspace_id
      and m.user_id=n.user_id and m.role in ('owner','admin')
    where n.connection_id=j.connection_id and n.workspace_id=j.workspace_id
      and n.user_id=j.user_id and n.notion_workspace_id=j.notion_workspace_id
      and n.version=j.credential_version and n.revoked_at is null
      and n.refresh_attempt_id is null
  ) then
    update public.atlas_notion_async_jobs set status='dead',
      lease_id=null,lease_until=null,last_error_code='credential_rotated',
      completed_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=j.id;
    return false;
  end if;
  next_status := case
    when p_outcome='succeeded' then 'succeeded'
    when p_outcome='permanent' or j.attempts>=j.max_attempts then 'dead'
    else 'queued' end;
  update public.atlas_notion_async_jobs set status=next_status,
    lease_id=null,lease_until=null,
    available_at=case when next_status='queued'
      then clock_timestamp()+make_interval(secs=>p_delay_seconds)
      else available_at end,
    last_error_code=case
      when next_status='succeeded' then null
      when next_status='dead' and j.attempts>=j.max_attempts
        and p_outcome not in ('permanent','succeeded') then 'attempts_exhausted'
      else p_error_code end,
    completed_at=case when next_status='queued' then null
      else clock_timestamp() end,updated_at=clock_timestamp()
    where id=j.id;
  return true;
end $$;
revoke all on function public.atlas_notion_finish_async_task(uuid,uuid,text,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_finish_async_task(uuid,uuid,text,integer,text)
  to service_role;

-- Local revocation OR credential rotation permanently destroys task pointers.
-- Token-bearing provider task IDs must not survive a disconnected binding.
create function public.atlas_notion_invalidate_async_jobs()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
  delete from public.atlas_notion_async_jobs where connection_id=new.connection_id;
  return new;
end $$;
revoke all on function public.atlas_notion_invalidate_async_jobs()
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_invalidate_async_jobs()
  to service_role;
create trigger atlas_notion_async_jobs_invalidate
  after update of revoked_at,version on public.atlas_notion_connections
  for each row when (
    (old.revoked_at is null and new.revoked_at is not null)
    or old.version is distinct from new.version
  ) execute function public.atlas_notion_invalidate_async_jobs();
