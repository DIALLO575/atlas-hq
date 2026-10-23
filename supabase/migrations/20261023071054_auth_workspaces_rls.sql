-- Workspace identity and membership. Keep this version aligned with the migration
-- already recorded in Supabase project ovzmmsxqfifneqqgnrzd.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_workspace_id_idx
  on public.workspace_members (user_id, workspace_id);

create or replace function private.is_workspace_member(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and (select auth.uid()) is not null
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_workspace_admin(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and (select auth.uid()) is not null
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.is_workspace_admin(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_admin(uuid) to authenticated;

create or replace function private.add_workspace_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
revoke all on function private.add_workspace_owner_membership() from public, anon, authenticated;
drop trigger if exists workspaces_add_owner_membership on public.workspaces;
create trigger workspaces_add_owner_membership
  after insert on public.workspaces
  for each row execute function private.add_workspace_owner_membership();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on public.workspaces, public.workspace_members from public, anon;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, delete on public.workspace_members to authenticated;

drop policy if exists workspaces_read_member on public.workspaces;
create policy workspaces_read_member on public.workspaces
  for select to authenticated using (private.is_workspace_member(id));
drop policy if exists workspaces_create_self on public.workspaces;
create policy workspaces_create_self on public.workspaces
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_admin on public.workspaces
  for update to authenticated using (private.is_workspace_admin(id))
  with check (private.is_workspace_admin(id));
drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete to authenticated using (created_by = (select auth.uid()));

drop policy if exists workspace_members_read_member on public.workspace_members;
create policy workspace_members_read_member on public.workspace_members
  for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists workspace_members_add_admin on public.workspace_members;
create policy workspace_members_add_admin on public.workspace_members
  for insert to authenticated
  with check (role in ('admin', 'member') and private.is_workspace_admin(workspace_id));
drop policy if exists workspace_members_remove_admin on public.workspace_members;
create policy workspace_members_remove_admin on public.workspace_members
  for delete to authenticated using (role = 'member' and private.is_workspace_admin(workspace_id));

-- RLS binds created_by to auth.uid(); clients cannot assign another owner.
-- Owner membership is inserted only by the private SECURITY DEFINER trigger.
