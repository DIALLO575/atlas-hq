create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members(user_id, created_at);

create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.add_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger workspaces_add_owner_membership
after insert on public.workspaces
for each row execute function private.add_workspace_owner_membership();

create function private.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and (select auth.uid()) is not null
      and wm.user_id = (select auth.uid())
  );
$$;

create function private.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and (select auth.uid()) is not null
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  );
$$;

revoke all on function private.add_workspace_owner_membership() from public;
revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.is_workspace_admin(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_admin(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.atlas_connections enable row level security;
alter table public.atlas_provider_objects enable row level security;
alter table public.atlas_sync_cursors enable row level security;

grant select, insert, delete on public.workspaces to authenticated;
grant update (name, updated_at) on public.workspaces to authenticated;
grant select, insert, delete on public.workspace_members to authenticated;

create policy workspaces_read_member
on public.workspaces for select to authenticated
using (
  private.is_workspace_member(id)
);

create policy workspaces_create_self
on public.workspaces for insert to authenticated
with check (created_by = (select auth.uid()));

create policy workspaces_update_admin
on public.workspaces for update to authenticated
using (
  private.is_workspace_admin(id)
)
with check (
  private.is_workspace_admin(id)
);

create policy workspaces_delete_owner
on public.workspaces for delete to authenticated
using (
  created_by = (select auth.uid())
);

create policy workspace_members_read_member
on public.workspace_members for select to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy workspace_members_add_admin
on public.workspace_members for insert to authenticated
with check (
  role in ('admin', 'member')
  and private.is_workspace_admin(workspace_id)
);

create policy workspace_members_remove_admin
on public.workspace_members for delete to authenticated
using (
  role = 'member'
  and private.is_workspace_admin(workspace_id)
);

-- Existing connector rows remain private to their authenticated owner.
grant select, insert, update, delete on public.atlas_connections to authenticated;
grant select, insert, update, delete on public.atlas_provider_objects to authenticated;
grant select, insert, update, delete on public.atlas_sync_cursors to authenticated;

drop policy if exists atlas_connections_read_owner on public.atlas_connections;
create policy atlas_connections_read_owner
on public.atlas_connections for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists atlas_provider_objects_read_connection_owner on public.atlas_provider_objects;
create policy atlas_provider_objects_read_connection_owner
on public.atlas_provider_objects for select to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_provider_objects.connection_id and c.owner_id = (select auth.uid())
  )
);

drop policy if exists atlas_sync_cursors_read_connection_owner on public.atlas_sync_cursors;
create policy atlas_sync_cursors_read_connection_owner
on public.atlas_sync_cursors for select to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_sync_cursors.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_connections_insert_owner
on public.atlas_connections for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy atlas_connections_update_owner
on public.atlas_connections for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy atlas_connections_delete_owner
on public.atlas_connections for delete to authenticated
using (owner_id = (select auth.uid()));

create policy atlas_provider_objects_insert_connection_owner
on public.atlas_provider_objects for insert to authenticated
with check (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_provider_objects.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_provider_objects_update_connection_owner
on public.atlas_provider_objects for update to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_provider_objects.connection_id and c.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_provider_objects.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_provider_objects_delete_connection_owner
on public.atlas_provider_objects for delete to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_provider_objects.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_sync_cursors_insert_connection_owner
on public.atlas_sync_cursors for insert to authenticated
with check (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_sync_cursors.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_sync_cursors_update_connection_owner
on public.atlas_sync_cursors for update to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_sync_cursors.connection_id and c.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_sync_cursors.connection_id and c.owner_id = (select auth.uid())
  )
);

create policy atlas_sync_cursors_delete_connection_owner
on public.atlas_sync_cursors for delete to authenticated
using (
  exists (
    select 1 from public.atlas_connections c
    where c.id = atlas_sync_cursors.connection_id and c.owner_id = (select auth.uid())
  )
);
