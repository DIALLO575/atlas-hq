-- Disposable PG17 only; follows the agent-request proposal/checks.
\set ON_ERROR_STOP on
create temp table team_request_baseline as select count(*) as n from private.atlas_engine_outbox;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"session_id":"aaaacccc-0000-4000-8000-000000000001"}',false);
do $$ declare manifest jsonb; invalid jsonb; result record; begin
 manifest:='{"format":"openmaus.team","version":2,"team":{"name":"FORGE","description":"Équipe proposée","members":[{"key":"vision","name":"VISION","title":"Analyse","description":"Revue","appearance":{"color":"blue"}},{"key":"shuri","name":"SHURI","title":"Développement","description":"Implémentation","appearance":{"color":"green"}}]}}'::jsonb;
 select * into result from public.atlas_engine_request_team('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000001',manifest);
 if result.created is distinct from true or result.decision is distinct from 'pending' or result.can_dispatch is distinct from false then raise exception 'TEAM_REQUEST_FAILED';end if;
 select * into result from public.atlas_engine_request_team('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000001',manifest);
 if result.created is distinct from false then raise exception 'TEAM_REQUEST_DUPLICATED';end if;
 for invalid in select * from (values
  (manifest || '{"approved":true}'::jsonb),
  (jsonb_set(manifest,'{team,tools}','["full"]'::jsonb,true)),
  (jsonb_set(manifest,'{team,members,0,soul}','"hidden instructions"'::jsonb,true)),
  (jsonb_set(manifest,'{team,members,0,appearance,permissions}','"full"'::jsonb,true)),
  (jsonb_set(manifest,'{team,members,1,key}','"vision"'::jsonb)),
  (jsonb_set(manifest,'{team,members}','[]'::jsonb)),
  (jsonb_set(manifest,'{team,members}',(select jsonb_agg(jsonb_set(manifest#>'{team,members,0}','{key}',to_jsonb('agent-'||n))) from generate_series(1,13) as g(n)))) ,
  (jsonb_set(manifest,'{team,members,0,description}',to_jsonb(repeat('x',1001)))),
  (jsonb_set(manifest,'{team,members,0,title}',to_jsonb('bad'||chr(1)))),
  (jsonb_set(manifest,'{version}','"2"'::jsonb))
 ) as invalid_cases(value) loop
  begin
   perform public.atlas_engine_request_team('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000002',invalid);
   raise exception 'HOSTILE_TEAM_ACCEPTED';
  exception when insufficient_privilege then null;end;
 end loop;
 begin
  perform public.atlas_engine_request_team('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000001',jsonb_set(manifest,'{team,name}','"CHANGED"'::jsonb));
  raise exception 'TEAM_CHANGED_REPLAY_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  perform public.atlas_engine_request_team('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-0000-4000-8000-000000000002','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000003',manifest);
  raise exception 'TEAM_CROSS_TENANT_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  perform public.atlas_engine_request_agent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeee2222-0000-4000-8000-000000000001','DIFFERENT OPERATION','','');
  raise exception 'TEAM_ID_REUSED_AS_AGENT';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from public.atlas_engine_pending_agent_profiles('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) then raise exception 'TEAM_SELF_REVIEW_DETAILS';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.atlas_engine_request_team(uuid,uuid,uuid,uuid,jsonb)','EXECUTE') then raise exception 'TEAM_ANON_EXECUTE';end if;
 if has_function_privilege('authenticated','private.atlas_engine_request_profile_internal(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'GENERIC_PROFILE_EXPOSED';end if;
 if (select prosecdef from pg_proc where oid='public.atlas_engine_request_team(uuid,uuid,uuid,uuid,jsonb)'::regprocedure) then raise exception 'TEAM_PUBLIC_DEFINER';end if;
 begin update public.atlas_engine_runs set request_summary=jsonb_set(request_summary,'{team,name}','"tamper"'::jsonb) where id='eeee2222-0000-4000-8000-000000000001';raise exception 'TEAM_SUMMARY_MUTABLE';exception when insufficient_privilege then null;end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"session_id":"aaaacccc-0000-4000-8000-000000000003"}',false);
do $$ declare summary jsonb; fingerprint text; begin
 select request_summary into summary from public.atlas_engine_pending_agent_profiles('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where run_id='eeee2222-0000-4000-8000-000000000001';
 if summary#>>'{team,name}' is distinct from 'FORGE' or jsonb_array_length(summary#>'{team,members}') is distinct from 2 then raise exception 'TEAM_REVIEW_DETAILS_MISSING';end if;
 select intent_digest into fingerprint from public.atlas_engine_pending_approvals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where run_id='eeee2222-0000-4000-8000-000000000001';
 perform public.atlas_engine_decide_approval('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeee2222-0000-4000-8000-000000000001',fingerprint,'approved');
end $$;
reset role;
do $$ begin
 if (select count(*) from private.atlas_engine_outbox)<>(select n from team_request_baseline) then raise exception 'TEAM_REQUEST_DISPATCHED';end if;
 if (select state from public.atlas_engine_runs where id='eeee2222-0000-4000-8000-000000000001') is distinct from 'awaiting-approval' then raise exception 'TEAM_REQUEST_AUTHORIZED_RUN';end if;
 if (select count(*) from private.atlas_engine_audit_events where run_id='eeee2222-0000-4000-8000-000000000001' and event_key='engine.approval.requested')<>1 then raise exception 'TEAM_AUDIT_DUPLICATE';end if;
end $$;
