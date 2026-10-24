-- Per-actor Linear OAuth credentials. Ciphertext only; migration is review-only
-- in this PR and must not be applied to the official Supabase project.
create table if not exists public.atlas_linear_connections (
  workspace_id uuid not null,
  user_id uuid not null,
  linear_workspace_id uuid not null,
  linear_actor_id uuid not null,
  token_key_id text not null check (token_key_id ~ '^[A-Za-z0-9._-]{1,48}$'),
  access_nonce text not null check (length(access_nonce) = 16),
  access_ciphertext text not null check (length(access_ciphertext) between 1 and 21846),
  access_tag text not null check (length(access_tag) = 22),
  refresh_nonce text not null check (length(refresh_nonce) = 16),
  refresh_ciphertext text not null check (length(refresh_ciphertext) between 1 and 21846),
  refresh_tag text not null check (length(refresh_tag) = 22),
  scopes text[] not null check (scopes = array['read']::text[]),
  access_expires_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint atlas_linear_connection_actor_membership_fk
    foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  constraint atlas_linear_connection_expiry_after_creation
    check (access_expires_at > created_at),
  constraint atlas_linear_connection_revocation_after_creation
    check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists atlas_linear_connections_linear_workspace_idx
  on public.atlas_linear_connections (workspace_id, linear_workspace_id)
  where revoked_at is null;

alter table public.atlas_linear_connections enable row level security;
revoke all privileges on public.atlas_linear_connections from public, anon, authenticated;
grant select, insert, update on public.atlas_linear_connections to service_role;
-- No client RLS policy is intentional. Only a server using the service role
-- can access ciphertext; every application lookup also filters ATLAS actor and workspace.

create or replace function public.atlas_linear_save_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_linear_workspace_id uuid,
  p_linear_actor_id uuid,
  p_token_key_id text,
  p_access_nonce text,
  p_access_ciphertext text,
  p_access_tag text,
  p_refresh_nonce text,
  p_refresh_ciphertext text,
  p_refresh_tag text,
  p_scopes text[],
  p_access_expires_at timestamptz,
  p_expected_version integer
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare saved_version integer;
begin
  if p_expected_version is null then
    insert into public.atlas_linear_connections (
      workspace_id, user_id, linear_workspace_id, linear_actor_id, token_key_id,
      access_nonce, access_ciphertext, access_tag, refresh_nonce, refresh_ciphertext,
      refresh_tag, scopes, access_expires_at, version, revoked_at, updated_at
    ) values (
      p_workspace_id, p_user_id, p_linear_workspace_id, p_linear_actor_id, p_token_key_id,
      p_access_nonce, p_access_ciphertext, p_access_tag, p_refresh_nonce, p_refresh_ciphertext,
      p_refresh_tag, p_scopes, p_access_expires_at, 1, null, now()
    ) on conflict (workspace_id, user_id) do nothing
    returning version into saved_version;
  else
    update public.atlas_linear_connections set
      linear_workspace_id = p_linear_workspace_id,
      linear_actor_id = p_linear_actor_id,
      token_key_id = p_token_key_id,
      access_nonce = p_access_nonce,
      access_ciphertext = p_access_ciphertext,
      access_tag = p_access_tag,
      refresh_nonce = p_refresh_nonce,
      refresh_ciphertext = p_refresh_ciphertext,
      refresh_tag = p_refresh_tag,
      scopes = p_scopes,
      access_expires_at = p_access_expires_at,
      version = version + 1,
      revoked_at = null,
      updated_at = now()
    where workspace_id = p_workspace_id and user_id = p_user_id
      and version = p_expected_version
    returning version into saved_version;
  end if;
  return saved_version;
end;
$$;

create or replace function public.atlas_linear_revoke_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  update public.atlas_linear_connections set
    revoked_at = coalesce(revoked_at, now()),
    version = version + 1,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id
    and version = p_expected_version and revoked_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.atlas_linear_save_connection(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text[], timestamptz, integer
) from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_save_connection(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text[], timestamptz, integer
) to service_role;
revoke all on function public.atlas_linear_revoke_connection(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_revoke_connection(uuid, uuid, integer) to service_role;
