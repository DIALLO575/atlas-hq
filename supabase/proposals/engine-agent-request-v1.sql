-- SHA150/127 PROPOSAL ONLY. Disposable PG CI; NOT applied on Supabase.
-- An offline agent-profile request, never an engine operation or outbox enqueue.
alter table public.atlas_engine_runs add column request_summary jsonb
 check(request_summary is null or (primitive_id='agents.create' and jsonb_typeof(request_summary)='object' and octet_length(request_summary::text)<=8192));
create function private.atlas_engine_request_summary_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.request_summary is distinct from old.request_summary then
  raise exception 'ENGINE_REQUEST_SUMMARY_IMMUTABLE' using errcode='42501';
 end if;
 if new.request_summary is not null and new.payload_sha256 is distinct from
  encode(extensions.digest(convert_to(new.request_summary::text,'UTF8'),'sha256'),'hex') then
  raise exception 'ENGINE_REQUEST_SUMMARY_DIGEST_MISMATCH' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.atlas_engine_request_summary_guard() from public,anon,authenticated;
create trigger atlas_engine_request_summary_guard before insert or update on public.atlas_engine_runs
 for each row execute function private.atlas_engine_request_summary_guard();

create function private.atlas_engine_request_agent_internal(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,
 p_name text,p_title text,p_description text)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); sid uuid; sid_text text:=auth.jwt()->>'session_id';
 summary jsonb; fingerprint text; inserted_id uuid; stored public.atlas_engine_runs%rowtype;
begin
 if actor is null or p_workspace_id is null or p_instance_id is null or p_mission_id is null or p_request_id is null
 or p_name is null or length(btrim(p_name)) not between 1 and 100 or p_name ~ '[[:cntrl:]]'
 or p_title is null or length(p_title)>200 or p_title ~ '[[:cntrl:]]'
 or p_description is null or length(p_description)>1000
 or sid_text is null or sid_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 sid:=sid_text::uuid;
 if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=actor
  and (s.not_after is null or s.not_after>clock_timestamp()) for share)
 or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id
  and m.user_id=actor and m.role in('owner','admin') for share)
 or not exists(select 1 from public.atlas_engine_instances i where i.id=p_instance_id
  and i.workspace_id=p_workspace_id and i.engine_key='mausbot' and i.connection_state='offline' for share)
 or not exists(select 1 from public.atlas_missions m where m.id=p_mission_id and m.workspace_id=p_workspace_id
  and m.status in('planned','active') for share) then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 summary:=jsonb_build_object('name',btrim(p_name),'title',btrim(p_title),'description',btrim(p_description));
 fingerprint:=encode(extensions.digest(convert_to(summary::text,'UTF8'),'sha256'),'hex');
 insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256,state,request_summary)
 values(p_request_id,p_workspace_id,p_instance_id,p_mission_id,actor,'agents.create',fingerprint,'awaiting-approval',summary)
 on conflict(id) do nothing returning id into inserted_id;
 select * into stored from public.atlas_engine_runs r where r.id=p_request_id for update;
 if not found or stored.workspace_id<>p_workspace_id or stored.instance_id<>p_instance_id
 or stored.mission_id<>p_mission_id or stored.requested_by<>actor or stored.primitive_id<>'agents.create'
 or stored.payload_sha256<>fingerprint or stored.request_summary is distinct from summary then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=actor
  and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 if inserted_id is not null then
  insert into private.atlas_engine_approvals(workspace_id,instance_id,run_id,requested_by,expires_at,intent_digest)
  values(p_workspace_id,p_instance_id,p_request_id,actor,clock_timestamp()+interval '15 minutes',
   private.atlas_engine_intent_digest(p_workspace_id,p_instance_id,p_request_id,p_mission_id,'agents.create',fingerprint));
  insert into private.atlas_engine_audit_events(workspace_id,instance_id,run_id,actor_id,event_key,payload_digest)
  values(p_workspace_id,p_instance_id,p_request_id,actor,'engine.approval.requested',
   private.atlas_engine_intent_digest(p_workspace_id,p_instance_id,p_request_id,p_mission_id,'agents.create',fingerprint));
 end if;
 return query select a.run_id,a.intent_digest,a.decision,a.expires_at,inserted_id is not null,false
 from private.atlas_engine_approvals a where a.run_id=p_request_id and a.workspace_id=p_workspace_id;
end $$;
revoke all on function private.atlas_engine_request_agent_internal(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.atlas_engine_request_agent_internal(uuid,uuid,uuid,uuid,text,text,text) to authenticated;
create function public.atlas_engine_request_agent(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,p_name text,p_title text,p_description text)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language sql volatile security invoker set search_path='' as $$
 select * from private.atlas_engine_request_agent_internal(p_workspace_id,p_instance_id,p_mission_id,p_request_id,p_name,p_title,p_description);
$$;
revoke all on function public.atlas_engine_request_agent(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.atlas_engine_request_agent(uuid,uuid,uuid,uuid,text,text,text) to authenticated;

-- Reviewer details use the same live-session/role/anti-self-review predicate,
-- rechecked on this statement rather than relying on a previous HTTP read.
create function private.atlas_engine_pending_agent_profiles_internal(p_workspace_id uuid)
returns table(run_id uuid,request_summary jsonb)
language sql stable security definer set search_path='' as $$
 select r.id,r.request_summary from public.atlas_engine_pending_approvals(p_workspace_id) a
 join public.atlas_engine_runs r on r.workspace_id=p_workspace_id and r.id=a.run_id
 where r.primitive_id='agents.create';
$$;
revoke all on function private.atlas_engine_pending_agent_profiles_internal(uuid) from public,anon,authenticated;
grant execute on function private.atlas_engine_pending_agent_profiles_internal(uuid) to authenticated;
create function public.atlas_engine_pending_agent_profiles(p_workspace_id uuid)
returns table(run_id uuid,request_summary jsonb)
language sql stable security invoker set search_path='' as $$
 select * from private.atlas_engine_pending_agent_profiles_internal(p_workspace_id);
$$;
revoke all on function public.atlas_engine_pending_agent_profiles(uuid) from public,anon,authenticated;
grant execute on function public.atlas_engine_pending_agent_profiles(uuid) to authenticated;
