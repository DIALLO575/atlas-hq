-- ATLAS GitHub App authorization records. Must be populated ONLY by a trusted
-- server-side workflow after live GitHub ownership/repository verification.
-- Not applied to the official Supabase project by this PR.
--
-- Existing public.atlas_connections is USER-WRITABLE under its older RLS rules
-- and must NEVER be treated as proof of GitHub App installation authorization.

create table if not exists public.atlas_github_installations (
  installation_id bigint primary key check (installation_id > 0),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'pending-ownership-check'
    check (status in ('pending-ownership-check', 'active', 'repositories-ready',
                     'selection-rejected', 'suspended', 'revoked')),
  repository_selection text check (repository_selection in ('selected', 'all')),
  ownership_verified_at timestamptz,
  repositories_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_ready_requires_proof check (
    status <> 'repositories-ready' or (
      repository_selection = 'selected'
      and ownership_verified_at is not null
      and repositories_verified_at is not null
    )
  )
);

-- One GitHub App installation is assigned to one workspace at a time in V1.
-- Cross-workspace sharing requires a later explicit authorization model.
create index if not exists atlas_github_installations_workspace_idx
  on public.atlas_github_installations (workspace_id);

create table if not exists public.atlas_github_authorized_repositories (
  installation_id bigint not null references public.atlas_github_installations(installation_id)
    on delete cascade,
  repository_id bigint not null check (repository_id > 0),
  created_at timestamptz not null default now(),
  primary key (installation_id, repository_id)
);

-- Explicit fail-closed RLS even when the project's auto-RLS event trigger exists.
alter table public.atlas_github_installations enable row level security;
alter table public.atlas_github_authorized_repositories enable row level security;

-- The browser may read ONLY authorized workspace records. It cannot create a
-- "repositories-ready" installation or alter granted repositories.
revoke all privileges on public.atlas_github_installations,
  public.atlas_github_authorized_repositories from public, anon, authenticated;
grant select on public.atlas_github_installations,
  public.atlas_github_authorized_repositories to authenticated;

-- Only a trusted server-side service with secret credentials can verify and
-- persist GitHub authorization claims, never user cookies or the publishable key.
grant select, insert, update, delete on public.atlas_github_installations,
  public.atlas_github_authorized_repositories to service_role;

drop policy if exists atlas_github_installations_read_member
  on public.atlas_github_installations;
create policy atlas_github_installations_read_member
  on public.atlas_github_installations for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists atlas_github_repositories_read_member
  on public.atlas_github_authorized_repositories;
create policy atlas_github_repositories_read_member
  on public.atlas_github_authorized_repositories for select to authenticated
  using (
    exists (
      select 1 from public.atlas_github_installations i
      where i.installation_id = atlas_github_authorized_repositories.installation_id
        and private.is_workspace_member(i.workspace_id)
    )
  );
