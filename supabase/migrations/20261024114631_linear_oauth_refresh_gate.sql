-- Durable single-flight gate for rotating Linear refresh tokens.
-- A claimed attempt is never automatically expired: an ambiguous provider
-- response must block retries rather than risk consuming a rotated token twice.
alter table public.atlas_linear_connections
  add column if not exists refresh_attempt_id uuid,
  add column if not exists refresh_started_at timestamptz,
  add column if not exists refresh_completed_attempt_id uuid;

alter table public.atlas_linear_connections
  drop constraint if exists atlas_linear_connection_refresh_claim_pair;
alter table public.atlas_linear_connections
  add constraint atlas_linear_connection_refresh_claim_pair
  check ((refresh_attempt_id is null) = (refresh_started_at is null));

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
      refresh_completed_attempt_id = case when revoked_at is not null then null else refresh_completed_attempt_id end,
      version = version + 1,
      revoked_at = null,
      updated_at = now()
    where workspace_id = p_workspace_id and user_id = p_user_id
      and version = p_expected_version and refresh_attempt_id is null
    returning version into saved_version;
  end if;
  return saved_version;
end;
$$;

create or replace function public.atlas_linear_claim_refresh(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_attempt_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  if p_attempt_id is null then return false; end if;
  update public.atlas_linear_connections set
    refresh_attempt_id = p_attempt_id,
    refresh_started_at = now(),
    refresh_completed_attempt_id = null,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id
    and version = p_expected_version and revoked_at is null
    and refresh_attempt_id is null
    and access_expires_at <= now() + interval '5 minutes';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.atlas_linear_complete_refresh(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_attempt_id uuid,
  p_token_key_id text,
  p_access_nonce text,
  p_access_ciphertext text,
  p_access_tag text,
  p_refresh_nonce text,
  p_refresh_ciphertext text,
  p_refresh_tag text,
  p_scopes text[],
  p_access_expires_at timestamptz
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare saved_version integer;
begin
  if p_attempt_id is null then return null; end if;
  if p_scopes is distinct from array['read']::text[] or p_access_expires_at <= now() then
    return null;
  end if;
  update public.atlas_linear_connections set
    token_key_id = p_token_key_id,
    access_nonce = p_access_nonce,
    access_ciphertext = p_access_ciphertext,
    access_tag = p_access_tag,
    refresh_nonce = p_refresh_nonce,
    refresh_ciphertext = p_refresh_ciphertext,
    refresh_tag = p_refresh_tag,
    scopes = p_scopes,
    access_expires_at = p_access_expires_at,
    refresh_attempt_id = null,
    refresh_started_at = null,
    refresh_completed_attempt_id = p_attempt_id,
    version = version + 1,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id
    and version = p_expected_version and refresh_attempt_id = p_attempt_id
    and revoked_at is null
  returning version into saved_version;
  return saved_version;
end;
$$;

create or replace function public.atlas_linear_reject_refresh(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_attempt_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  if p_attempt_id is null then return false; end if;
  update public.atlas_linear_connections set
    revoked_at = now(),
    refresh_attempt_id = null,
    refresh_started_at = null,
    refresh_completed_attempt_id = null,
    version = version + 1,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id
    and version = p_expected_version and refresh_attempt_id = p_attempt_id
    and revoked_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- Used only after Linear returned a rotated token pair but storage completion
-- could not be confirmed. It tombstones either the still-claimed old row or
-- the immediately completed version, never an unrelated later reconnect.
create or replace function public.atlas_linear_uncertain_refresh(
  p_workspace_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_attempt_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  if p_attempt_id is null then return false; end if;
  update public.atlas_linear_connections set
    revoked_at = now(),
    refresh_attempt_id = null,
    refresh_started_at = null,
    refresh_completed_attempt_id = null,
    version = version + 1,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id and revoked_at is null
    and ((version = p_expected_version and refresh_attempt_id = p_attempt_id) or
         (version = p_expected_version + 1 and refresh_attempt_id is null
          and refresh_completed_attempt_id = p_attempt_id));
  get diagnostics affected = row_count;
  return affected = 1;
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
    refresh_attempt_id = null,
    refresh_started_at = null,
    refresh_completed_attempt_id = null,
    version = version + 1,
    updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id
    and version = p_expected_version and revoked_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.atlas_linear_claim_refresh(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_claim_refresh(uuid, uuid, integer, uuid) to service_role;
revoke all on function public.atlas_linear_complete_refresh(
  uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text[], timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_complete_refresh(
  uuid, uuid, integer, uuid, text, text, text, text, text, text, text, text[], timestamptz
) to service_role;
revoke all on function public.atlas_linear_reject_refresh(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_reject_refresh(uuid, uuid, integer, uuid) to service_role;
revoke all on function public.atlas_linear_uncertain_refresh(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_uncertain_refresh(uuid, uuid, integer, uuid) to service_role;
revoke all on function public.atlas_linear_revoke_connection(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_linear_revoke_connection(uuid, uuid, integer) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_claim_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') then
    raise exception 'Refresh claim RPC grants do not match the server-only contract';
  end if;
  if has_function_privilege('anon', 'public.atlas_linear_complete_refresh(uuid,uuid,integer,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_complete_refresh(uuid,uuid,integer,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_complete_refresh(uuid,uuid,integer,uuid,text,text,text,text,text,text,text,text[],timestamp with time zone)', 'EXECUTE') then
    raise exception 'Refresh completion RPC grants do not match the server-only contract';
  end if;
  if has_function_privilege('anon', 'public.atlas_linear_reject_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_reject_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_reject_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') then
    raise exception 'Invalid-grant RPC grants do not match the server-only contract';
  end if;
  if has_function_privilege('anon', 'public.atlas_linear_uncertain_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.atlas_linear_uncertain_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') or
     not has_function_privilege('service_role', 'public.atlas_linear_uncertain_refresh(uuid,uuid,integer,uuid)', 'EXECUTE') then
    raise exception 'Uncertain-outcome RPC grants do not match the server-only contract';
  end if;
end $$;
