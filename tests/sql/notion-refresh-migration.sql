-- Disposable PostgreSQL only: no browser RPC, CAS, rotation, tombstone.
do $$
declare fn text;
begin
 foreach fn in array array[
 'public.atlas_notion_claim_refresh(uuid,uuid,uuid,integer,uuid)',
 'public.atlas_notion_complete_refresh(uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,text)',
 'public.atlas_notion_fail_refresh(uuid,uuid,uuid,integer,uuid)'] loop
  if has_function_privilege('anon',fn,'EXECUTE')
  or has_function_privilege('authenticated',fn,'EXECUTE')
  or not has_function_privilege('service_role',fn,'EXECUTE')
  then raise exception 'Unsafe RPC grant %',fn; end if;
 end loop;
end $$;
set role service_role;
do $$
declare id uuid := '123e4567-e89b-12d3-a456-426614174007';
        a uuid := '66666666-6666-4666-8666-666666666666';
        b uuid := '77777777-7777-4777-8777-777777777777';
        v integer;
begin
 if public.atlas_notion_store_connection(id,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'Refresh test','testkey','MDAwMDAwMDAwMDAw',
   'Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',
   'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg',
   'AAAAAAAAAAAAAAAAAAAAAA') is distinct from id
   then raise exception 'Refresh test fixture absent'; end if;
 if public.atlas_notion_claim_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',1,b)
  then raise exception 'Cross actor claim accepted'; end if;
 if not public.atlas_notion_claim_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',1,a)
  then raise exception 'Valid claim failed'; end if;
 if public.atlas_notion_claim_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',1,b)
  then raise exception 'Duplicate claim succeeded'; end if;
 if public.atlas_notion_revoke_connection(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',1)
  then raise exception 'Revoked during refresh'; end if;
 begin
  perform public.atlas_notion_store_connection(
   '123e4567-e89b-12d3-a456-426614174008',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'Reauth in flight','testkey','MDAwMDAwMDAwMDAw',
   'Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',
   'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA');
  raise exception 'Reauth bypassed gate';
 exception when raise_exception then
  if sqlerrm <> 'NOTION_REFRESH_IN_PROGRESS' then raise; end if;
 end;
 if public.atlas_notion_complete_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',1,b,
  'testkey','MDAwMDAwMDAwMDAw','Y2lwaGVydGV4dA','AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDAx','cmVmcmVzaGNpcGhlcg','AAAAAAAAAAAAAAAAAAAAAA') is not null
  then raise exception 'Wrong attempt completed'; end if;
 v:=public.atlas_notion_complete_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',1,a,
  'testkey','MDAwMDAwMDAwMDAw','YQ','AAAAAAAAAAAAAAAAAAAAAA',
  'MDAwMDAwMDAwMDAx','Yg','AAAAAAAAAAAAAAAAAAAAAA');
 if v <> 2 then raise exception 'No atomic rotation'; end if;
 if not exists(select 1 from public.atlas_notion_connections where
  connection_id=id and version=2 and refresh_attempt_id is null
  and refresh_completed_attempt_id=a and access_ciphertext='YQ'
  and refresh_ciphertext='Yg')
  then raise exception 'Rotated pair mismatched'; end if;
 if not public.atlas_notion_claim_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',2,b)
  then raise exception 'Next claim failed'; end if;
 if not public.atlas_notion_fail_refresh(id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',2,b)
  then raise exception 'Failed to tombstone uncertain attempt'; end if;
 if exists(select 1 from public.atlas_notion_connections where connection_id=id and revoked_at is null)
  or exists(select 1 from public.atlas_connections where public.atlas_connections.id='123e4567-e89b-12d3-a456-426614174007' and status='connected')
  then raise exception 'Uncertain refresh left access active'; end if;
end $$;
reset role;
