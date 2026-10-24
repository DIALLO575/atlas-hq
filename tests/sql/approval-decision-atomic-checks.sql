-- SHA-150 disposable PostgreSQL 17 atomic human decision tests.
\set ON_ERROR_STOP on
-- Other engine-foundation tests already insert outbox fixtures. Only assert
-- that approval decisions do NOT create any additional rows.
create temp table approval_decision_outbox_baseline as
 select count(*)::integer as n from private.atlas_engine_outbox;
-- Prior Inbox test revoked the admin role and session. Issue a fresh mock session.
update public.workspace_members set role='admin'
 where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   and user_id='33333333-3333-4333-8333-333333333333';
insert into public.workspace_members(workspace_id,user_id,role) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333','admin');
insert into auth.sessions(id,user_id,not_after) values
 ('cccc0000-0000-4000-8000-000000000003',
  '33333333-3333-4333-8333-333333333333',now()+interval '1 hour');
do $$ begin
 if has_function_privilege('anon','public.atlas_engine_decide_approval(uuid,uuid,text,text)','EXECUTE')
 then raise exception 'ANON_CAN_DECIDE';end if;
 if (select prosecdef from pg_proc
   where oid='public.atlas_engine_decide_approval(uuid,uuid,text,text)'::regprocedure)
 then raise exception 'PUBLIC_DECISION_PRIVILEGED';end if;
 if not (select prosecdef from pg_proc
   where oid='private.atlas_engine_decide_approval_internal(uuid,uuid,text,text)'::regprocedure)
 then raise exception 'PRIVATE_DECISION_UNPRIVILEGED';end if;
 if has_table_privilege('authenticated','private.atlas_engine_approvals','UPDATE')
 then raise exception 'PRIVATE_APPROVAL_UPDATE_GRANT';end if;
end $$;
select set_config('test.engine_fingerprint_a',
 (select intent_digest from private.atlas_engine_approvals
  where run_id='aaaaaaa3-0000-4000-8000-000000000003'),false);
select set_config('test.engine_fingerprint_b',
 (select intent_digest from private.atlas_engine_approvals
  where run_id='bbbbbbb3-0000-4000-8000-000000000003'),false);
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"cccc0000-0000-4000-8000-000000000003"}',false);
-- Wrong fingerprint must never mutate pending.
do $$
begin
 begin
  perform public.atlas_engine_decide_approval(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaa3-0000-4000-8000-000000000003',repeat('f',64),'approved');
  raise exception 'INCORRECT_DIGEST_ACCEPTED';
 exception when insufficient_privilege then null;end;
end $$;
-- Every action uses a pinned DB fingerprint. A revoked role/JWT/self actor
-- cannot decide even by calling the SQL RPC outside the Next.js route.
set role authenticated;
-- Requester is an owner, but is not allowed to decide their own run.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000001"}',false);
do $begin
 begin
  perform public.atlas_engine_decide_approval(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaa3-0000-4000-8000-000000000003',
   current_setting('test.engine_fingerprint_a'),'approved');
  raise exception 'SELF_APPROVAL_ACCEPTED';
 exception when insufficient_privilege then null;end;
end $;
-- Cross-tenant request is denied, even with a valid session in A.
do $begin
 begin
  perform public.atlas_engine_decide_approval(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'bbbbbbb3-0000-4000-8000-000000000003',
   current_setting('test.engine_fingerprint_b'),'approved');
  raise exception 'FOREIGN_WORKSPACE_APPROVED';
 exception when insufficient_privilege then null;end;
end $;
-- A reviewer with expired session cannot approve any run.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaabbbb-0000-4000-8000-000000000004"}',false);
do $begin
 begin
  perform public.atlas_engine_decide_approval(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaa3-0000-4000-8000-000000000003',
   current_setting('test.engine_fingerprint_a'),'approved');
  raise exception 'EXPIRED_SESSION_APPROVED';
 exception when insufficient_privilege then null;end;
end $;
select set_config('request.jwt.claims','{"session_id":"not-a-uuid"}',false);
do $begin
 begin
  perform public.atlas_engine_decide_approval(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaa3-0000-4000-8000-000000000003',
   current_setting('test.engine_fingerprint_a'),'approved');
  raise exception 'MALFORMED_SESSION_APPROVED';
 exception when insufficient_privilege then null;end;
end $;
reset role;
-- Real reviewer, pinned digest from verified Inbox, approve once.
do $$
declare fingerprint text;result_decision text;dispatch_flag boolean;
begin
 select intent_digest into fingerprint
  from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  where run_id='aaaaaaa3-0000-4000-8000-000000000003';
 if fingerprint is null then raise exception 'INBOX_FINGERPRINT_MISSING';end if;
 select decision,can_dispatch into result_decision,dispatch_flag from public.atlas_engine_decide_approval(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaa3-0000-4000-8000-000000000003',fingerprint,'approved');
 if result_decision<>'approved' or dispatch_flag is distinct from false then raise exception 'APPROVAL_DECISION_FAILED_OR_DISPATCHED';end if;
 begin
  perform public.atlas_engine_decide_approval(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaa3-0000-4000-8000-000000000003',fingerprint,'rejected');
  raise exception 'SECOND_DECISION_ACCEPTED';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from public.atlas_engine_pending_approvals(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then
  raise exception 'APPROVED_STILL_VISIBLE_AS_PENDING';end if;
end $$;
reset role;
do $$
begin
 if not exists(select 1 from private.atlas_engine_approvals
  where run_id='aaaaaaa3-0000-4000-8000-000000000003'
   and decision='approved'
   and decided_by='33333333-3333-4333-8333-333333333333') then
   raise exception 'APPROVAL_NOT_PERSISTED';end if;
 if (select count(*) from private.atlas_engine_audit_events
  where run_id='aaaaaaa3-0000-4000-8000-000000000003'
   and event_key='engine.approval.approved')<>1 then
   raise exception 'APPROVAL_AUDIT_MISSING';end if;
 if (select count(*) from private.atlas_engine_outbox)<>
    (select n from pg_temp.approval_decision_outbox_baseline) then
   raise exception 'DECISION_DISPATCHED_WITHOUT_WORKER';end if;
end $$;
-- Revoking the reviewer role prevents even a correct pending B decision.
update public.workspace_members set role='member'
 where workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 and user_id='33333333-3333-4333-8333-333333333333';
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"cccc0000-0000-4000-8000-000000000003"}',false);
do $begin
 begin
  perform public.atlas_engine_decide_approval(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'bbbbbbb3-0000-4000-8000-000000000003',
   current_setting('test.engine_fingerprint_b'),'rejected');
  raise exception 'REVOKED_ROLE_APPROVED';
 exception when insufficient_privilege then null;end;
end $;
reset role;
update public.workspace_members set role='admin'
 where workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 and user_id='33333333-3333-4333-8333-333333333333';
-- Use second tenant to test audit failure causes COMPLETE rollback.
create function pg_temp.fail_approval_audit() returns trigger language plpgsql as $$
begin
 if new.event_key='engine.approval.rejected' then
  raise exception 'TEST_AUDIT_UNAVAILABLE' using errcode='P0001';end if;
 return new;
end $$;
create trigger temp_fail_approval_audit before insert on private.atlas_engine_audit_events
 for each row execute function pg_temp.fail_approval_audit();
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"cccc0000-0000-4000-8000-000000000003"}',false);
do $$
declare fingerprint text;
begin
 select intent_digest into fingerprint from public.atlas_engine_pending_approvals(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') limit 1;
 if fingerprint is null then raise exception 'SECOND_TENANT_FINGERPRINT_MISSING';end if;
 begin
  perform public.atlas_engine_decide_approval(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'bbbbbbb3-0000-4000-8000-000000000003',fingerprint,'rejected');
  raise exception 'AUDIT_FAIL_EXPECTED';
 exception when raise_exception then
  -- Confirm exception originated from the audit trigger, not sentinel.
  if SQLERRM<>'TEST_AUDIT_UNAVAILABLE' then raise;end if;
 end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.atlas_engine_approvals
  where run_id='bbbbbbb3-0000-4000-8000-000000000003' and decision='pending')
 then raise exception 'AUDIT_FAILURE_DID_NOT_ROLLBACK';end if;
end $$;
drop trigger temp_fail_approval_audit on private.atlas_engine_audit_events;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"cccc0000-0000-4000-8000-000000000003"}',false);
do $$
declare fingerprint text;result_decision text;dispatch_flag boolean;
begin
 select intent_digest into fingerprint from public.atlas_engine_pending_approvals(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') limit 1;
 select decision,can_dispatch into result_decision,dispatch_flag from public.atlas_engine_decide_approval(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbb3-0000-4000-8000-000000000003',fingerprint,'rejected');
 if result_decision<>'rejected' or dispatch_flag is distinct from false then raise exception 'REJECTION_FAILED_OR_DISPATCHED';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.atlas_engine_audit_events
  where run_id='bbbbbbb3-0000-4000-8000-000000000003'
   and event_key='engine.approval.rejected')<>1 then
  raise exception 'REJECT_AUDIT_MISSING';end if;
end $$;
-- Even a still-valid JWT cannot decide after losing the admin role.
update public.workspace_members set role='member' where
 workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and user_id='33333333-3333-4333-8333-333333333333';
-- No live dispatch or outbox should have occurred.
do $$ begin
 if (select count(*) from private.atlas_engine_outbox)<>
    (select n from pg_temp.approval_decision_outbox_baseline) then
  raise exception 'DECISION_CREATED_OUTBOX';end if;
end $$;
