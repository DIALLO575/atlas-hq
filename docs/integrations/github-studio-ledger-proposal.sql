-- REVIEW ONLY. Schema proposal for SHA-154; not in supabase/migrations and NOT applied.
-- Service-role server writes only. Browser may read limited metadata under workspace RLS.
-- The authoritative deployment migration must be generated and validated separately.
create table if not exists public.atlas_github_studio_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  installation_id bigint not null references public.atlas_github_installations(installation_id),
  actor_id uuid not null references auth.users(id),
  idempotency_key uuid not null,
  action text not null check (action = 'repository.create'),
  intent_digest text not null check (intent_digest ~ '^[0-9a-f]{64}$'),
  status text not null check (status in
    ('prepared','dispatching','provider_confirmed','reconciliation_required','succeeded','failed')),
  repository_id bigint check (repository_id is null or repository_id > 0),
  result_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, actor_id, idempotency_key)
);
create index if not exists atlas_gh_studio_ops_workspace_idx
  on public.atlas_github_studio_operations(workspace_id, created_at desc);
alter table public.atlas_github_studio_operations enable row level security;
revoke all on public.atlas_github_studio_operations from public, anon, authenticated;
grant select on public.atlas_github_studio_operations to authenticated;
grant select,insert,update on public.atlas_github_studio_operations to service_role;
drop policy if exists atlas_gh_studio_ops_read on public.atlas_github_studio_operations;
create policy atlas_gh_studio_ops_read on public.atlas_github_studio_operations
  for select to authenticated using (private.is_workspace_admin(workspace_id));

-- Audit events append-only. Service role insertion only; no UPDATE/DELETE role grants.
create table if not exists public.atlas_github_studio_audit (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.atlas_github_studio_operations(id),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  installation_id bigint not null,
  action text not null check (action = 'repository.create'),
  stage text not null check (stage in
    ('prepared','dispatching','provider_confirmed','reconciliation_required','succeeded','failed')),
  result_code text,
  event_at timestamptz not null default now()
);
create index if not exists atlas_gh_studio_audit_workspace_idx
  on public.atlas_github_studio_audit(workspace_id, event_at desc);
alter table public.atlas_github_studio_audit enable row level security;
revoke all on public.atlas_github_studio_audit from public, anon, authenticated;
grant select on public.atlas_github_studio_audit to authenticated;
grant select,insert on public.atlas_github_studio_audit to service_role;
drop policy if exists atlas_gh_studio_audit_read on public.atlas_github_studio_audit;
create policy atlas_gh_studio_audit_read on public.atlas_github_studio_audit
  for select to authenticated using (private.is_workspace_admin(workspace_id));
-- Before implementation: add DB-atomic CAS/locks, app-level tenant/install binding check,
-- actor session expiry enforcement, restricted webhook reconciler and transition triggers.
-- Do NOT migrate this draft directly into production.
