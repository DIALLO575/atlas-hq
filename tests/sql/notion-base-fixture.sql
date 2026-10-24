-- Runs only on an ephemeral Postgres service after linear-oauth-state-fixture.sql.
-- Minimal faithful stand-ins for the existing generic registry and index tables.
create table public.atlas_connections (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  provider text not null,
  account_label text not null,
  tenant_key text,
  status text not null default 'disconnected',
  adapter_version text,
  granted_scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  secret_ref text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.atlas_provider_objects (
  connection_id uuid not null references public.atlas_connections(id),
  object_type text not null,
  provider_object_id text not null,
  title text not null,
  primary key (connection_id, object_type, provider_object_id)
);
create table public.atlas_sync_cursors (
  connection_id uuid not null references public.atlas_connections(id),
  collection text not null,
  cursor text,
  primary key (connection_id, collection)
);
alter table public.atlas_connections enable row level security;
alter table public.atlas_provider_objects enable row level security;
alter table public.atlas_sync_cursors enable row level security;
grant select, insert, update, delete on
  public.atlas_connections, public.atlas_provider_objects, public.atlas_sync_cursors
  to authenticated;
grant select, insert, update, delete on
  public.atlas_connections, public.atlas_provider_objects, public.atlas_sync_cursors
  to service_role;
