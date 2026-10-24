-- SHA-135 / ATLAS Notion V2: durable provenance, never durable authorization.
-- SOURCE ONLY: run in disposable PostgreSQL. Not applied to official Supabase.
-- A verified read stores only object identity/timestamps; NEVER token, content, title.
create table public.atlas_notion_resource_observations (
  connection_id uuid not null references public.atlas_notion_connections(connection_id)
    on delete cascade,
  workspace_id uuid not null,
  user_id uuid not null,
  notion_workspace_id uuid not null,
  resource_kind text not null check (resource_kind in ('page','block','database','data_source')),
  resource_id uuid not null,
  connection_version integer not null check (connection_version > 0),
  source_updated_at timestamptz,
  observed_at timestamptz not null default clock_timestamp(),
  primary key (connection_id, resource_kind, resource_id),
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id,user_id)
    on delete cascade
);
create index atlas_notion_resource_observations_actor_idx
  on public.atlas_notion_resource_observations(workspace_id,user_id,observed_at desc);
alter table public.atlas_notion_resource_observations enable row level security;
revoke all on table public.atlas_notion_resource_observations
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.atlas_notion_resource_observations
  to service_role;

-- Service-role-only, single-transaction check-and-record. Lock the credential
-- so a concurrent revoke/refresh cannot commit between authorization and save.
create function public.atlas_notion_record_resource_observation(
  p_connection_id uuid, p_workspace_id uuid, p_user_id uuid,
  p_notion_workspace_id uuid, p_connection_version integer,
  p_resource_kind text, p_resource_id uuid,
  p_source_updated_at timestamptz default null
) returns boolean
language plpgsql security invoker set search_path = pg_catalog,public as $$
declare permitted uuid;
begin
  if p_connection_id is null or p_workspace_id is null or p_user_id is null or
     p_notion_workspace_id is null or p_resource_id is null or
     p_connection_version is null or p_connection_version < 1 or
     p_resource_kind is null or
     p_resource_kind not in ('page','block','database','data_source') then
    return false;
  end if;
  select n.connection_id into permitted
  from public.atlas_notion_connections n
  join public.atlas_connections a
    on a.id=n.connection_id and a.workspace_id=n.workspace_id
      and a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
  join public.workspace_members m on m.workspace_id=n.workspace_id
    and m.user_id=n.user_id and m.role in ('owner','admin')
  where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
    and n.user_id=p_user_id and n.notion_workspace_id=p_notion_workspace_id
    and n.version=p_connection_version and n.revoked_at is null
    and n.refresh_attempt_id is null
  for update of n;
  if permitted is null then return false; end if;
  insert into public.atlas_notion_resource_observations (
    connection_id,workspace_id,user_id,notion_workspace_id,resource_kind,
    resource_id,connection_version,source_updated_at,observed_at
  ) values (
    p_connection_id,p_workspace_id,p_user_id,p_notion_workspace_id,p_resource_kind,
    p_resource_id,p_connection_version,p_source_updated_at,clock_timestamp()
  ) on conflict (connection_id,resource_kind,resource_id) do update set
    connection_version=excluded.connection_version,
    source_updated_at=excluded.source_updated_at,
    observed_at=excluded.observed_at;
  return true;
end;
$$;
revoke all on function public.atlas_notion_record_resource_observation(
  uuid,uuid,uuid,uuid,integer,text,uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_record_resource_observation(
  uuid,uuid,uuid,uuid,integer,text,uuid,timestamptz) to service_role;

-- The caller is an authenticated user verified separately by the Next server.
-- The SQL RPC enforces the SAME actor, admin membership and an ACTIVE personal
-- connection; records are strictly historical and are never OAuth grants.
create function public.atlas_notion_list_resource_observations(
  p_workspace_id uuid, p_user_id uuid, p_limit integer default 10
) returns table (
  connection_id uuid, resource_kind text, resource_id uuid,
  source_updated_at timestamptz, observed_at timestamptz,
  notion_workspace_id uuid
)
language sql stable security invoker set search_path = pg_catalog,public as $$
  select o.connection_id,o.resource_kind,o.resource_id,
    o.source_updated_at,o.observed_at,o.notion_workspace_id
  from public.atlas_notion_resource_observations o
  join public.atlas_notion_connections n
    on n.connection_id=o.connection_id and n.workspace_id=o.workspace_id
      and n.user_id=o.user_id
      and n.notion_workspace_id=o.notion_workspace_id
      and n.version=o.connection_version and n.revoked_at is null
      and n.refresh_attempt_id is null
  join public.atlas_connections a
    on a.id=n.connection_id and a.workspace_id=n.workspace_id
      and a.owner_id=n.user_id and a.provider='notion' and a.status='connected'
  join public.workspace_members m
    on m.workspace_id=o.workspace_id and m.user_id=o.user_id
      and m.role in ('owner','admin')
  where o.workspace_id=p_workspace_id and o.user_id=p_user_id
    and p_limit between 1 and 20
    and o.observed_at >= now()-interval '30 days'
  order by o.observed_at desc, o.resource_id
  limit least(greatest(p_limit,1),20);
$$;
revoke all on function public.atlas_notion_list_resource_observations(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_list_resource_observations(uuid,uuid,integer)
  to service_role;

-- Drop historical observations immediately on disconnect (including the
-- fail-closed refresh tombstone). Trigger uses the same service-role invoker.
create function public.atlas_notion_clear_resource_observations()
returns trigger language plpgsql security invoker
set search_path = pg_catalog,public as $$
begin
  delete from public.atlas_notion_resource_observations
    where connection_id=new.connection_id;
  return new;
end $$;
revoke all on function public.atlas_notion_clear_resource_observations()
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_clear_resource_observations()
  to service_role;
create trigger atlas_notion_resource_observations_revoke
  after update of revoked_at on public.atlas_notion_connections
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function public.atlas_notion_clear_resource_observations();
