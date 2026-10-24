-- SHA-122: Applied to ATLAS official Supabase on 2026-10-24 under version 20261024140422.
-- Durable one-winner token refresh. An ambiguous provider response may have
-- rotated its refresh token: never auto-expire/take over a pending claim.
alter table public.atlas_notion_connections
  add column refresh_attempt_id uuid,
  add column refresh_started_at timestamptz,
  add column refresh_completed_attempt_id uuid;
alter table public.atlas_notion_connections add constraint notion_refresh_claim_pair
  check ((refresh_attempt_id is null) = (refresh_started_at is null));

create function public.atlas_notion_claim_refresh(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_expected_version integer,p_attempt_id uuid
) returns boolean language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare n integer;
begin
  if p_attempt_id is null or p_expected_version is null then return false; end if;
  update public.atlas_notion_connections n set
    refresh_attempt_id=p_attempt_id,refresh_started_at=now(),
    refresh_completed_attempt_id=null,updated_at=now()
  where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
    and n.user_id=p_user_id and n.version=p_expected_version
    and n.revoked_at is null and n.refresh_attempt_id is null
    and n.refresh_ciphertext is not null
    and exists(select 1 from public.atlas_connections r
      where r.id=p_connection_id and r.owner_id=p_user_id
      and r.workspace_id=p_workspace_id and r.provider='notion'
      and r.status='connected')
    and exists(select 1 from public.workspace_members m
      where m.workspace_id=p_workspace_id and m.user_id=p_user_id
      and m.role in ('owner','admin'));
  get diagnostics n = row_count;
  return n=1;
end $$;

create function public.atlas_notion_complete_refresh(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_expected_version integer,p_attempt_id uuid,
  p_token_key_id text,p_access_nonce text,p_access_ciphertext text,
  p_access_tag text,p_refresh_nonce text,p_refresh_ciphertext text,p_refresh_tag text
) returns integer language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare saved integer;
begin
  if p_attempt_id is null or p_expected_version is null
    or p_refresh_nonce is null or p_refresh_ciphertext is null
    or p_refresh_tag is null then return null; end if;
  update public.atlas_notion_connections n set
    token_key_id=p_token_key_id,access_nonce=p_access_nonce,
    access_ciphertext=p_access_ciphertext,access_tag=p_access_tag,
    refresh_nonce=p_refresh_nonce,refresh_ciphertext=p_refresh_ciphertext,
    refresh_tag=p_refresh_tag,refresh_attempt_id=null,refresh_started_at=null,
    refresh_completed_attempt_id=p_attempt_id,version=version+1,updated_at=now()
  where n.connection_id=p_connection_id and n.workspace_id=p_workspace_id
    and n.user_id=p_user_id and n.version=p_expected_version
    and n.refresh_attempt_id=p_attempt_id and n.revoked_at is null
    and exists(select 1 from public.workspace_members m
      where m.workspace_id=p_workspace_id and m.user_id=p_user_id
      and m.role in ('owner','admin'))
  returning n.version into saved;
  if saved is null then return null; end if;
  update public.atlas_connections r set checked_at=now(),updated_at=now()
    where r.id=p_connection_id and r.workspace_id=p_workspace_id
      and r.owner_id=p_user_id and r.provider='notion' and r.status='connected';
  if not found then raise exception 'NOTION_REGISTRY_BINDING_INVALID'; end if;
  return saved;
end $$;

-- For invalid_grant, ambiguous network outcome or uncertain storage commit,
-- tombstone this exact attempt. Never touch unrelated later reauthorization.
create function public.atlas_notion_fail_refresh(
  p_connection_id uuid,p_workspace_id uuid,p_user_id uuid,
  p_expected_version integer,p_attempt_id uuid
) returns boolean language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare n integer;
begin
  if p_attempt_id is null or p_expected_version is null then return false; end if;
  update public.atlas_notion_connections c set
    revoked_at=now(),version=version+1,
    refresh_attempt_id=null,refresh_started_at=null,
    refresh_completed_attempt_id=null,updated_at=now()
  where c.connection_id=p_connection_id and c.workspace_id=p_workspace_id
    and c.user_id=p_user_id and c.revoked_at is null
    and ((c.version=p_expected_version and c.refresh_attempt_id=p_attempt_id)
       or (c.version=p_expected_version+1 and c.refresh_attempt_id is null
         and c.refresh_completed_attempt_id=p_attempt_id));
  get diagnostics n = row_count;
  if n<>1 then return false; end if;
  update public.atlas_connections r set
    status='disconnected',checked_at=now(),updated_at=now()
    where r.id=p_connection_id and r.workspace_id=p_workspace_id
      and r.owner_id=p_user_id and r.provider='notion';
  if not found then raise exception 'NOTION_REGISTRY_BINDING_INVALID'; end if;
  return true;
end $$;

revoke all on function public.atlas_notion_claim_refresh(uuid,uuid,uuid,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_claim_refresh(uuid,uuid,uuid,integer,uuid)
  to service_role;
revoke all on function public.atlas_notion_complete_refresh(uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_complete_refresh(uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,text)
  to service_role;
revoke all on function public.atlas_notion_fail_refresh(uuid,uuid,uuid,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_fail_refresh(uuid,uuid,uuid,integer,uuid)
  to service_role;
