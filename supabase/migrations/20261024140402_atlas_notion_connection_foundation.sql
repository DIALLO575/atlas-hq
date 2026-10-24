-- SHA-120/SHA-122: ATLAS generic connector hardening + Notion REST OAuth schema.
-- Applied to ATLAS official Supabase on 2026-10-24 under version 20261024140402.
-- Do not replay manually; use version history and a forward migration for changes.
--
-- The existing generic connector registry is owned by the ATLAS session, but
-- client-editable provider grants, status and secret_ref are not authority.
-- Preserve owner SELECT, allow cosmetic account_label updates only, and use
-- service_role server routes for all verified provider metadata and writes.
revoke insert, update, delete on table public.atlas_connections from anon, authenticated;
grant update (account_label) on table public.atlas_connections to authenticated;
revoke insert, update, delete on table public.atlas_provider_objects from anon, authenticated;
revoke insert, update, delete on table public.atlas_sync_cursors from anon, authenticated;

-- Compatible with prior owner-scoped rows: workspace_id is nullable for legacy
-- providers, but mandatory for Notion. Every non-null binding must correspond
-- to an actual workspace membership.
alter table public.atlas_connections add column if not exists workspace_id uuid;
alter table public.atlas_connections
  add constraint atlas_connections_workspace_membership_fk
  foreign key (workspace_id, owner_id)
  references public.workspace_members(workspace_id, user_id) on delete cascade;
alter table public.atlas_connections
  add constraint atlas_notion_requires_atlas_workspace
  check (provider <> 'notion' or workspace_id is not null);
create unique index atlas_connections_binding_uidx
  on public.atlas_connections (id, workspace_id, owner_id);

create table public.atlas_notion_oauth_states (
  state_hash text primary key check (length(state_hash) = 64),
  workspace_id uuid not null,
  user_id uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notion_state_actor_membership_fk
    foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  constraint notion_state_expiry_check check (expires_at > created_at),
  constraint notion_state_consumed_check check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index atlas_notion_oauth_states_expiry_idx
  on public.atlas_notion_oauth_states (expires_at);
alter table public.atlas_notion_oauth_states enable row level security;
revoke all on table public.atlas_notion_oauth_states from public, anon, authenticated;
grant select, insert, update on table public.atlas_notion_oauth_states to service_role;
-- Deliberately no RLS policies or browser grants. Server stores hashes only.
-- The single conditional UPDATE consumed_at IS NULL AND expires_at > now()
-- serves as the atomic replay barrier.

create table public.atlas_notion_connections (
  connection_id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null,
  notion_workspace_id uuid not null,
  notion_bot_id uuid not null,
  token_key_id text not null check (token_key_id ~ '^[A-Za-z0-9._-]{1,48}$'),
  access_nonce text not null check (length(access_nonce) = 16),
  access_ciphertext text not null check (length(access_ciphertext) between 1 and 21846),
  access_tag text not null check (length(access_tag) = 22),
  refresh_nonce text check (refresh_nonce is null or length(refresh_nonce) = 16),
  refresh_ciphertext text check (
    refresh_ciphertext is null or length(refresh_ciphertext) between 1 and 21846
  ),
  refresh_tag text check (refresh_tag is null or length(refresh_tag) = 22),
  version integer not null default 1 check (version > 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_refresh_triplet_check check (
    (refresh_nonce is null and refresh_ciphertext is null and refresh_tag is null)
    or (refresh_nonce is not null and refresh_ciphertext is not null and refresh_tag is not null)
  ),
  constraint notion_connection_actor_membership_fk
    foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  constraint notion_connection_registry_binding_fk
    foreign key (connection_id, workspace_id, user_id)
    references public.atlas_connections(id, workspace_id, owner_id) on delete cascade
);
create index atlas_notion_connections_actor_idx
  on public.atlas_notion_connections(workspace_id, user_id) where revoked_at is null;
alter table public.atlas_notion_connections enable row level security;
revoke all on table public.atlas_notion_connections from public, anon, authenticated;
grant select, insert, update on table public.atlas_notion_connections to service_role;
-- No RLS client policies; vault ciphertext is accessed only through validated
-- server routes, never through the browser Supabase client.
