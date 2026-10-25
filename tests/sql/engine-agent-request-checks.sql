-- Disposable PG17 only. The production proposal is NOT applied to Supabase.
\set ON_ERROR_STOP on
alter table public.atlas_missions add column status text not null default 'planned';
create temp table request_baseline as select count(*) as n from private.atlas_engine_outbox;
update public.atlas_engine_instances set connection_state='offline' where id='aaaaaaaa-0000-4000-8000-000000000001';
update public.workspace_members set role='owner' where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111';
update public.workspace_members set role='admin' where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='33333333-3333-4333-8333-333333333333';
insert into auth.sessions(id,user_id,not_after) values('aaaacccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
 ('aaaacccc-0000-4000-8000-000000000003','33333333-3333-4333-8333-333333333333',now()+interval '1 hour');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"session_id":"aaaacccc-0000-4000-8000-000000000001"}',false);
do $$ declare result record; begin
 select * into result from public.atlas_engine_request_agent(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000001','VISION','Analyste','Lire une PR autorisée');
 if result.created is distinct from true or result.decision<>'pending' or result.can_dispatch is distinct from false then raise exception 'REQUEST_FAILED';end if;
 select * into result from public.atlas_engine_request_agent(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000001','VISION','Analyste','Lire une PR autorisée');
 if result.created is distinct from false then raise exception 'REQUEST_REPLAY_CREATED_DUPLICATE';end if;
 begin
 perform public.atlas_engine_request_agent(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000001','CHANGED','Analyste','Lire une PR autorisée');
 raise exception 'CHANGED_REPLAY_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
 perform public.atlas_engine_request_agent(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-0000-4000-8000-000000000002',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000002','VISION','','');
 raise exception 'CROSS_TENANT_INSTANCE_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
 perform public.atlas_engine_request_agent(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001',
 'ffffffff-ffff-4fff-8fff-ffffffffffff','eeee1111-0000-4000-8000-000000000002','VISION','','');
 raise exception 'CROSS_TENANT_MISSION_ACCEPTED';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from public.atlas_engine_pending_agent_profiles('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then raise exception 'SELF_REVIEW_DETAILS_VISIBLE';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.atlas_engine_audit_events where run_id='eeee1111-0000-4000-8000-000000000001' and event_key='engine.approval.requested')<>1 then raise exception 'REQUEST_AUDIT_DUPLICATE';end if;
 begin update public.atlas_engine_runs set request_summary='{"name":"tamper"}' where id='eeee1111-0000-4000-8000-000000000001';raise exception 'SUMMARY_MUTABLE';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.atlas_engine_request_agent(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE') then raise exception 'ANON_REQUEST_GRANT';end if;
 if (select prosecdef from pg_proc where oid='public.atlas_engine_request_agent(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure) then raise exception 'PUBLIC_DEFINER';end if;
end $$;
-- Reviewer sees exact stored profile, then uses existing PR40 atomic decision.
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaacccc-0000-4000-8000-000000000003"}',false);
do $$ declare fingerprint text; profile jsonb; begin
 select request_summary into profile from public.atlas_engine_pending_agent_profiles('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where run_id='eeee1111-0000-4000-8000-000000000001';
 if profile->>'name' is distinct from 'VISION' or profile->>'title' is distinct from 'Analyste' then raise exception 'REVIEW_PROFILE_MISSING';end if;
 select intent_digest into fingerprint from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where run_id='eeee1111-0000-4000-8000-000000000001';
 perform public.atlas_engine_decide_approval('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeee1111-0000-4000-8000-000000000001',fingerprint,'approved');
end $$;
reset role;
-- Revoking the requester's session prevents creation despite the existing JWT.
delete from auth.sessions where id='aaaacccc-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"session_id":"aaaacccc-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.atlas_engine_request_agent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000003','REVOKED','','');raise exception 'REVOKED_REQUEST_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.atlas_engine_outbox)<>(select n from request_baseline) then raise exception 'REQUEST_DISPATCHED';end if;
 if (select state from public.atlas_engine_runs where id='eeee1111-0000-4000-8000-000000000001')<>'awaiting-approval' then raise exception 'REQUEST_AUTHORIZED_RUN';end if;
end $$;
-- Restore only a fake test session for remaining negative/concurrency scenarios.
insert into auth.sessions(id,user_id,not_after) values('aaaacccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',now()+interval '1 hour');
-- Audit unavailable => both run and pending request must roll back.
create function pg_temp.fail_agent_request_audit() returns trigger language plpgsql as $$ begin
 if new.event_key='engine.approval.requested' then raise exception 'TEST_REQUEST_AUDIT_UNAVAILABLE';end if;return new;end $$;
create trigger fail_agent_request_audit before insert on private.atlas_engine_audit_events for each row execute function pg_temp.fail_agent_request_audit();
set role authenticated;
do $$ begin
 begin perform public.atlas_engine_request_agent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000005','ROLLBACK','','');raise exception 'AUDIT_FAILURE_EXPECTED';
 exception when raise_exception then if SQLERRM<>'TEST_REQUEST_AUDIT_UNAVAILABLE' then raise;end if;end;
end $$;
reset role;
drop trigger fail_agent_request_audit on private.atlas_engine_audit_events;
do $$ begin
 if exists(select 1 from public.atlas_engine_runs where id='eeee1111-0000-4000-8000-000000000005') or exists(select 1 from private.atlas_engine_approvals where run_id='eeee1111-0000-4000-8000-000000000005') then raise exception 'REQUEST_AUDIT_ROLLBACK_FAILED';end if;
end $$;
update public.workspace_members set role='member' where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111';
set role authenticated;
do $$ begin
 begin perform public.atlas_engine_request_agent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000006','MEMBER','','');raise exception 'ROLE_REMOVED_REQUEST_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.workspace_members set role='owner' where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111';
update auth.sessions set not_after=now()-interval '1 second' where id='aaaacccc-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin
 begin perform public.atlas_engine_request_agent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee1111-0000-4000-8000-000000000007','EXPIRED','','');raise exception 'EXPIRED_REQUEST_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update auth.sessions set not_after=now()+interval '1 hour' where id='aaaacccc-0000-4000-8000-000000000001';
