-- Disposable PG17, two tenants, no production writes.
\set ON_ERROR_STOP on
insert into auth.sessions values
 ('aaaabbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
 ('aaaabbbb-0000-4000-8000-000000000003','33333333-3333-4333-8333-333333333333',now()+interval '1 hour'),
 ('aaaabbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',now()+interval '1 hour'),
 ('aaaabbbb-0000-4000-8000-000000000004','33333333-3333-4333-8333-333333333333',now()-interval '1 hour');
set role service_role;
insert into public.atlas_engine_runs
 (id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256)
 values
 ('aaaaaaa3-0000-4000-8000-000000000003',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
 'agents.list',repeat('e',64)),
 ('bbbbbbb3-0000-4000-8000-000000000003',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000002',
 'ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222',
 'agents.list',repeat('d',64));
insert into private.atlas_engine_approvals
 (workspace_id,instance_id,run_id,requested_by,expires_at,intent_digest)
 values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa3-0000-4000-8000-000000000003',
 '11111111-1111-4111-8111-111111111111',
 now()+interval '30 minutes',
 private.atlas_engine_intent_digest(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 'aaaaaaa3-0000-4000-8000-000000000003',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','agents.list',repeat('e',64))),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'bbbbbbbb-0000-4000-8000-000000000002',
 'bbbbbbb3-0000-4000-8000-000000000003',
 '22222222-2222-4222-8222-222222222222',
 now()+interval '30 minutes',
 private.atlas_engine_intent_digest(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'bbbbbbbb-0000-4000-8000-000000000002',
 'bbbbbbb3-0000-4000-8000-000000000003',
 'ffffffff-ffff-4fff-8fff-ffffffffffff','agents.list',repeat('d',64)));
reset role;
do $$
begin
 if has_function_privilege('anon','public.atlas_engine_pending_approvals(uuid)','EXECUTE') then
 raise exception 'ANON_CAN_READ_APPROVAL_INBOX';end if;
 if has_table_privilege('authenticated','private.atlas_engine_approvals','SELECT') then
 raise exception 'PRIVATE_APPROVAL_TABLE_EXPOSED';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000003"}',false);
do $$
begin
 if (select count(*) from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))<>1 then
  raise exception 'ADMIN_INBOX_MISSING';end if;
 if exists(select 1 from public.atlas_engine_pending_approvals('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) then
  raise exception 'TENANT_B_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000001"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'SELF_REVIEW_INBOX';end if;end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000002"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'FOREIGN_WORKSPACE';end if;end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000004"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'EXPIRED_SESSION';end if;end $$;
select set_config('request.jwt.claims','{"session_id":"not-uuid"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'INVALID_SESSION';end if;end $$;
select set_config('request.jwt.claims','{}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'ABSENT_SESSION';end if;end $$;
reset role;
delete from auth.sessions where id='aaaabbbb-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000003"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'REVOKED_SESSION';end if;end $$;
reset role;

-- Security advisor compliance: exposed RPC is INVOKER, definer stays private.
do $$
begin
 if (select prosecdef from pg_proc
  where oid='public.atlas_engine_pending_approvals(uuid)'::regprocedure)
 then raise exception 'PUBLIC_APPROVAL_RPC_HAS_PRIVILEGE_ESCALATION'; end if;
 if not (select prosecdef from pg_proc
  where oid='private.atlas_engine_pending_approvals_internal(uuid)'::regprocedure)
 then raise exception 'PRIVATE_INBOX_NOT_BOUND_TO_DATABASE_CHECKS'; end if;
 if has_function_privilege('anon','private.atlas_engine_pending_approvals_internal(uuid)','EXECUTE')
 then raise exception 'ANON_PRIVATE_INBOX_EXECUTE'; end if;
end $$;
-- Real current-role membership revocation should immediately remove access.
insert into auth.sessions values
 ('aaaabbbb-0000-4000-8000-000000000005',
 '33333333-3333-4333-8333-333333333333',now()+interval '1 hour');
update public.workspace_members set role='member'
 where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and user_id='33333333-3333-4333-8333-333333333333';
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000005"}',false);
do $$begin
 if exists(select 1 from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
 raise exception 'REVOKED_ADMIN_ROLE_STILL_HAS_INBOX';end if;
end $$;
reset role;
