-- B1 disposable PG17 only: after engine-foundation-fixture and migration.
\set ON_ERROR_STOP on
do $$ begin
 if (select count(*) from public.agent_page_settings) <> 6 then raise exception 'B1_DEFAULT_SEEDS_MISSING';end if;
 if (select agent_id from public.agent_page_settings where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and page_key='journal') is distinct from 'MORGANS' then raise exception 'B1_JOURNAL_DEFAULT';end if;
 if (select agent_id from public.agent_page_settings where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and page_key='*') is distinct from 'ROGER' then raise exception 'B1_GLOBAL_DEFAULT';end if;
 if not (select relrowsecurity from pg_class where oid='public.agent_page_settings'::regclass) then raise exception 'B1_RLS_SETTINGS_OFF';end if;
 if not (select relrowsecurity from pg_class where oid='public.agent_threads'::regclass) then raise exception 'B1_RLS_THREADS_OFF';end if;
 if not (select relrowsecurity from pg_class where oid='public.agent_send_receipts'::regclass) then raise exception 'B1_RLS_RECEIPTS_OFF';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ begin
 if (select count(*) from public.agent_page_settings)<>3 then raise exception 'B1_OWNER_SETTINGS_ACCESS';end if;
 update public.agent_page_settings set agent_id='MORGANS',entity='FOUNDER'
 where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and page_key='*';
 if (select agent_id from public.agent_page_settings where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and page_key='*')<>'MORGANS' then raise exception 'B1_PERSISTENCE';end if;
 insert into public.agent_threads(workspace_id,page_key,entity,agent_id,object_id,created_by)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','missions','FOUNDER','ROGER','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111');
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$ begin
 if exists(select 1 from public.agent_page_settings where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'B1_ADMIN_READ_ALLOWED';end if;
 begin
 update public.agent_page_settings set agent_id='ATTACKER' where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if found then raise exception 'B1_ADMIN_WRITE_ALLOWED';end if;
 exception when insufficient_privilege then null;end;
 begin
 insert into public.agent_threads(workspace_id,page_key,entity,agent_id,created_by)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','missions','VELMO','ROGER','33333333-3333-4333-8333-333333333333');
 raise exception 'B1_ADMIN_INSERT_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if exists(select 1 from public.agent_threads where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'B1_CROSS_WORKSPACE_READ_ALLOWED';end if;
 begin
  insert into public.agent_threads(workspace_id,page_key,entity,agent_id,created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','missions','WAHABI','ROGER','22222222-2222-4222-8222-222222222222');
  raise exception 'B1_CROSS_WORKSPACE_INSERT_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
