-- B1 proposal only. DO NOT APPLY without Paul's explicit go.
-- Workspace-scoped uniqueness prevents global page_key collisions.
-- "*" is a DEFAULT CONFIGURATION scope, NEVER an authorized data entity.
create table public.agent_page_settings (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  page_key text not null check (page_key = '*' or page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  entity text not null default '*' check (entity in ('*','FOUNDER','VELMO','WAHABI','NEW_PLATFORM','PERSO')),
  agent_id text not null check (agent_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, page_key)
);
-- Real configuration seeds only, not synthetic missions or conversations.
insert into public.agent_page_settings (workspace_id,page_key,entity,agent_id,updated_by)
select wm.workspace_id, seed.page_key, '*', seed.agent_id, wm.user_id
from public.workspace_members wm
cross join (values ('*','ROGER'),('journal','MORGANS'),('lecture','ROGER')) as seed(page_key,agent_id)
where wm.role='owner'
on conflict (workspace_id,page_key) do nothing;

create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  page_key text not null check (page_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  entity text not null check (entity in ('FOUNDER','VELMO','WAHABI','NEW_PLATFORM','PERSO')),
  agent_id text not null check (agent_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  object_id uuid,
  mausbot_task_id text check (mausbot_task_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique nulls not distinct (workspace_id,page_key,entity,object_id)
);
create index agent_threads_workspace_page_idx on public.agent_threads(workspace_id,page_key);

-- Durable send_id reservation; stores no message text, bearer or token.
create table public.agent_send_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  thread_id uuid not null,
  send_id uuid not null,
  body_digest text not null check (body_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending' check (state in ('pending','accepted','unknown')),
  mausbot_message_id text check (mausbot_message_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,thread_id) references public.agent_threads(workspace_id,id) on delete cascade,
  unique (workspace_id,send_id)
);
create index agent_send_receipts_thread_idx on public.agent_send_receipts(workspace_id,thread_id,created_at);

create or replace function private.agent_page_settings_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end; $$;
revoke all on function private.agent_page_settings_stamp() from public, anon, authenticated;
create trigger agent_page_settings_stamp before update on public.agent_page_settings
for each row execute function private.agent_page_settings_stamp();

alter table public.agent_page_settings enable row level security;
alter table public.agent_threads enable row level security;
alter table public.agent_send_receipts enable row level security;
revoke all on public.agent_page_settings,public.agent_threads,public.agent_send_receipts from public,anon,authenticated;
grant select,insert on public.agent_page_settings to authenticated;
grant update(agent_id,entity) on public.agent_page_settings to authenticated;
grant select,insert on public.agent_threads to authenticated;
grant update(mausbot_task_id,agent_id,updated_at) on public.agent_threads to authenticated;
grant select,insert on public.agent_send_receipts to authenticated;
grant update(state,mausbot_message_id) on public.agent_send_receipts to authenticated;

-- Owner check uses a locked SECURITY DEFINER helper, because the caller must
-- NOT be granted raw access to workspace_members to evaluate RLS.
create function private.is_agent_workspace_owner(_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace and wm.user_id = auth.uid() and wm.role = 'owner')
$$;
revoke all on function private.is_agent_workspace_owner(uuid) from public,anon;
grant execute on function private.is_agent_workspace_owner(uuid) to authenticated;

create policy agent_page_settings_owner_select on public.agent_page_settings for select to authenticated
using (private.is_agent_workspace_owner(workspace_id));
create policy agent_page_settings_owner_insert on public.agent_page_settings for insert to authenticated
with check (updated_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));
create policy agent_page_settings_owner_update on public.agent_page_settings for update to authenticated
using (private.is_agent_workspace_owner(workspace_id))
with check (private.is_agent_workspace_owner(workspace_id));

create policy agent_threads_owner_select on public.agent_threads for select to authenticated
using (private.is_agent_workspace_owner(workspace_id));
create policy agent_threads_owner_insert on public.agent_threads for insert to authenticated
with check (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));
create policy agent_threads_owner_update on public.agent_threads for update to authenticated
using (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id))
with check (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));

create policy agent_send_receipts_owner_select on public.agent_send_receipts for select to authenticated
using (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));
create policy agent_send_receipts_owner_insert on public.agent_send_receipts for insert to authenticated
with check (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));
create policy agent_send_receipts_owner_update on public.agent_send_receipts for update to authenticated
using (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id))
with check (created_by=(select auth.uid()) and private.is_agent_workspace_owner(workspace_id));
