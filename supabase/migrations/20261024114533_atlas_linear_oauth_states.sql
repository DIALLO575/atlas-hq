-- Durable one-time Linear OAuth state ledger. Official history records version
-- 20261024114533; do not replay this migration against that project.
create table if not exists public.atlas_linear_oauth_states (
  state_hash text primary key check (length(state_hash) = 64),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint linear_oauth_state_expiry_after_creation check (expires_at > created_at),
  constraint linear_oauth_state_consumption_after_creation check (
    consumed_at is null or consumed_at >= created_at
  )
);

create index if not exists atlas_linear_oauth_states_expiry_idx
  on public.atlas_linear_oauth_states (expires_at);

alter table public.atlas_linear_oauth_states enable row level security;
revoke all privileges on public.atlas_linear_oauth_states from public, anon, authenticated;
grant select, insert, update on public.atlas_linear_oauth_states to service_role;
-- Intentionally no client policy and no client grants. The server uses a single
-- conditional UPDATE (consumed_at IS NULL AND expires_at > now) as the atomic
-- replay barrier. Expired-row cleanup is a separate bounded maintenance task.
