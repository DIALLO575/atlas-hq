-- SHA-122: atomically persist verified Notion OAuth response and its encrypted
-- credential envelope. Service-role only. TEST IN DISPOSABLE DATABASE FIRST.
create unique index atlas_notion_active_actor_workspace_uidx
  on public.atlas_notion_connections(workspace_id, user_id, notion_workspace_id)
  where revoked_at is null;

create or replace function public.atlas_notion_store_connection(
  p_connection_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_notion_workspace_id uuid,
  p_notion_bot_id uuid,
  p_account_label text,
  p_token_key_id text,
  p_access_nonce text,
  p_access_ciphertext text,
  p_access_tag text,
  p_refresh_nonce text,
  p_refresh_ciphertext text,
  p_refresh_tag text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare chosen uuid;
begin
  if p_connection_id is null or p_notion_workspace_id is null or
     p_notion_bot_id is null or p_account_label is null or
     length(btrim(p_account_label)) not between 1 and 160 or
     not exists (
       select 1 from public.workspace_members
       where workspace_id = p_workspace_id and user_id = p_user_id
         and role in ('owner','admin')
     ) then return null; end if;
  -- Reauthorization rotates ciphertext and version in one transaction.
  select n.connection_id into chosen
  from public.atlas_notion_connections n
  where n.workspace_id = p_workspace_id and n.user_id = p_user_id
    and n.notion_workspace_id = p_notion_workspace_id and n.revoked_at is null
  for update;
  if chosen is null then
    insert into public.atlas_connections(
      id,owner_id,workspace_id,provider,account_label,tenant_key,
      status,granted_scopes,capabilities,checked_at
    ) values (
      p_connection_id,p_user_id,p_workspace_id,'notion',p_account_label,
      p_notion_workspace_id::text,'connected',array[]::text[],'{}'::jsonb,now()
    );
    insert into public.atlas_notion_connections(
      connection_id,workspace_id,user_id,notion_workspace_id,notion_bot_id,
      token_key_id,access_nonce,access_ciphertext,access_tag,
      refresh_nonce,refresh_ciphertext,refresh_tag
    ) values (
      p_connection_id,p_workspace_id,p_user_id,p_notion_workspace_id,p_notion_bot_id,
      p_token_key_id,p_access_nonce,p_access_ciphertext,p_access_tag,
      p_refresh_nonce,p_refresh_ciphertext,p_refresh_tag
    );
    return p_connection_id;
  end if;
  update public.atlas_notion_connections set
    notion_bot_id = p_notion_bot_id, token_key_id = p_token_key_id,
    access_nonce = p_access_nonce, access_ciphertext = p_access_ciphertext,
    access_tag = p_access_tag, refresh_nonce = p_refresh_nonce,
    refresh_ciphertext = p_refresh_ciphertext, refresh_tag = p_refresh_tag,
    version = version+1, updated_at = now()
  where connection_id = chosen and revoked_at is null;
  update public.atlas_connections set
    account_label = p_account_label, checked_at = now(),
    status = 'connected', updated_at = now()
  where id = chosen and workspace_id = p_workspace_id
    and owner_id = p_user_id and provider = 'notion';
  if not found then raise exception 'NOTION_REGISTRY_BINDING_INVALID'; end if;
  return chosen;
end;
$$;
revoke all on function public.atlas_notion_store_connection(
 uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_notion_store_connection(
 uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text
) to service_role;
