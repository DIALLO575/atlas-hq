-- GitHub personal installations may authorize either selected repositories
-- or all present/future repositories. Only the verified owner can bind an
-- installation, and only our privileged server can mark it ready.
-- The all mode is read-only and checks GitHub's live installation grant.
alter table public.atlas_github_installations
  drop constraint if exists github_ready_requires_proof;

alter table public.atlas_github_installations
  add constraint github_ready_requires_proof check (
    status <> 'repositories-ready' or (
      repository_selection in ('selected', 'all')
      and ownership_verified_at is not null
      and repositories_verified_at is not null
    )
  );
