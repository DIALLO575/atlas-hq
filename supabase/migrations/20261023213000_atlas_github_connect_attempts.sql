-- Server-only, single-use GitHub setup/OAuth nonce ledger.
-- This migration is committed for review, NOT applied to the official project.
create table if not exists public.atlas_github_connect_attempts (
  state_hash text primary key check (length(state_hash) = 64),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('installation', 'oauth', 'consumed')),
  installation_id bigint check (installation_id > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint github_oauth_attempt_requires_installation check (
    stage <> 'oauth' or installation_id is not null
  )
);
create index if not exists atlas_github_connect_attempts_expiry_idx
  on public.atlas_github_connect_attempts (expires_at);
alter table public.atlas_github_connect_attempts enable row level security;
revoke all privileges on public.atlas_github_connect_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.atlas_github_connect_attempts to service_role;
-- No policy for browser clients; all transitions require trusted server code.
