-- Applied to the ATLAS production project on 2026-10-25 via Supabase MCP.
-- Creates authenticated offline agent/team profile requests only; no dispatch.
alter table public.atlas_engine_runs add column request_summary jsonb
 check(request_summary is null or (primitive_id in('agents.create','teams.import') and jsonb_typeof(request_summary)='object' and octet_length(request_summary::text)<=65536));
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


-- Fixed-key profile schemas: no grants, tools, model, soul, path or executable fields.
create function private.atlas_engine_exact_json_keys(value jsonb,keys text[])
returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(value)='object' then value ?& keys and
  (select count(*) from jsonb_object_keys(value))=cardinality(keys) else false end;
$$;
revoke all on function private.atlas_engine_exact_json_keys(jsonb,text[]) from public,anon,authenticated;
create function private.atlas_engine_profile_text(value jsonb,max_length integer,allow_empty boolean)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(value)='string' and length(value#>>'{}')<=max_length
  and (allow_empty or length(btrim(value#>>'{}'))>0),false);
$$;
revoke all on function private.atlas_engine_profile_text(jsonb,integer,boolean) from public,anon,authenticated;
create function private.atlas_engine_normalize_team_request(value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare member jsonb; members jsonb:='[]'::jsonb; keys_seen text[]:=array[]::text[]; key text;
begin
 if not private.atlas_engine_exact_json_keys(value,array['format','version','team'])
  or value->>'format' is distinct from 'openmaus.team' or value->'version' is distinct from '2'::jsonb
  or not private.atlas_engine_exact_json_keys(value->'team',array['name','description','members'])
  or not private.atlas_engine_profile_text(value#>'{team,name}',100,false)
  or (value#>>'{team,name}') ~ '[[:cntrl:]]'
  or not private.atlas_engine_profile_text(value#>'{team,description}',1000,true)
  or translate(value#>>'{team,description}',chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]'
  or jsonb_typeof(value#>'{team,members}') is distinct from 'array' then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 if jsonb_array_length(value#>'{team,members}') not between 1 and 12 then
  raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
 end if;
 for member in select * from jsonb_array_elements(value#>'{team,members}') loop
  if not private.atlas_engine_exact_json_keys(member,array['key','name','title','description','appearance'])
   or jsonb_typeof(member->'key') is distinct from 'string'
   or (member->>'key') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
   or not private.atlas_engine_profile_text(member->'name',100,false) or (member->>'name') ~ '[[:cntrl:]]'
   or not private.atlas_engine_profile_text(member->'title',200,true) or (member->>'title') ~ '[[:cntrl:]]'
   or not private.atlas_engine_profile_text(member->'description',1000,true)
   or translate(member->>'description',chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]'
   or not private.atlas_engine_exact_json_keys(member->'appearance',array['color'])
   or jsonb_typeof(member#>'{appearance,color}') is distinct from 'string'
   or (member#>>'{appearance,color}') not in('green','blue','red','orange','purple','cyan','pink','yellow','teal','coral','silver','chrome') then
   raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
  end if;
  key:=member->>'key';
  if key=any(keys_seen) then raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';end if;
  keys_seen:=array_append(keys_seen,key);
  members:=members || jsonb_build_array(jsonb_build_object('key',key,'name',btrim(member->>'name'),
   'title',btrim(member->>'title'),'description',btrim(member->>'description'),'appearance',member->'appearance'));
 end loop;
 return jsonb_build_object('format','openmaus.team','version',2,'team',jsonb_build_object(
  'name',btrim(value#>>'{team,name}'),'description',btrim(value#>>'{team,description}'),'members',members));
end $$;
revoke all on function private.atlas_engine_normalize_team_request(jsonb) from public,anon,authenticated;

create function private.atlas_engine_request_profile_internal(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,
 p_primitive text,p_summary jsonb)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language plpgsql volatile security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); sid uuid; sid_text text:=auth.jwt()->>'session_id';
 summary jsonb; fingerprint text; inserted_id uuid; stored public.atlas_engine_runs%rowtype;
begin
 if actor is null or p_workspace_id is null or p_instance_id is null or p_mission_id is null or p_request_id is null
 or p_primitive is null or p_primitive not in('agents.create','teams.import')
 or p_summary is null or octet_length(p_summary::text)>65536
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
 if p_primitive='agents.create' then
  if not private.atlas_engine_exact_json_keys(p_summary,array['name','title','description'])
   or not private.atlas_engine_profile_text(p_summary->'name',100,false) or (p_summary->>'name') ~ '[[:cntrl:]]'
   or not private.atlas_engine_profile_text(p_summary->'title',200,true) or (p_summary->>'title') ~ '[[:cntrl:]]'
   or not private.atlas_engine_profile_text(p_summary->'description',1000,true) then
   raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';
  end if;
  summary:=jsonb_build_object('name',btrim(p_summary->>'name'),'title',btrim(p_summary->>'title'),'description',btrim(p_summary->>'description'));
 else summary:=private.atlas_engine_normalize_team_request(p_summary);end if;
 if octet_length(summary::text)>65536 then raise exception 'ENGINE_REQUEST_NOT_AVAILABLE' using errcode='42501';end if;
 fingerprint:=encode(extensions.digest(convert_to(summary::text,'UTF8'),'sha256'),'hex');
 insert into public.atlas_engine_runs(id,workspace_id,instance_id,mission_id,requested_by,primitive_id,payload_sha256,state,request_summary)
 values(p_request_id,p_workspace_id,p_instance_id,p_mission_id,actor,p_primitive,fingerprint,'awaiting-approval',summary)
 -- Both primary and tenant-composite unique indexes can arbitrate a concurrent
 -- replay. Handle either conflict, then verify the stored full intent below.
 on conflict do nothing returning id into inserted_id;
 select * into stored from public.atlas_engine_runs r where r.id=p_request_id for update;
 if not found or stored.workspace_id<>p_workspace_id or stored.instance_id<>p_instance_id
 or stored.mission_id<>p_mission_id or stored.requested_by<>actor or stored.primitive_id<>p_primitive
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
   private.atlas_engine_intent_digest(p_workspace_id,p_instance_id,p_request_id,p_mission_id,p_primitive,fingerprint));
  insert into private.atlas_engine_audit_events(workspace_id,instance_id,run_id,actor_id,event_key,payload_digest)
  values(p_workspace_id,p_instance_id,p_request_id,actor,'engine.approval.requested',
   private.atlas_engine_intent_digest(p_workspace_id,p_instance_id,p_request_id,p_mission_id,p_primitive,fingerprint));
 end if;
 return query select a.run_id,a.intent_digest,a.decision,a.expires_at,inserted_id is not null,false
 from private.atlas_engine_approvals a where a.run_id=p_request_id and a.workspace_id=p_workspace_id;
end $$;
revoke all on function private.atlas_engine_request_profile_internal(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
create function private.atlas_engine_request_agent_internal(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,p_name text,p_title text,p_description text)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language sql volatile security definer set search_path='' as $$
 select * from private.atlas_engine_request_profile_internal(p_workspace_id,p_instance_id,p_mission_id,p_request_id,
 'agents.create',jsonb_build_object('name',p_name,'title',p_title,'description',p_description));
$$;
revoke all on function private.atlas_engine_request_agent_internal(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.atlas_engine_request_agent_internal(uuid,uuid,uuid,uuid,text,text,text) to authenticated;
create function private.atlas_engine_request_team_internal(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,p_manifest jsonb)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language sql volatile security definer set search_path='' as $$
 select * from private.atlas_engine_request_profile_internal(p_workspace_id,p_instance_id,p_mission_id,p_request_id,'teams.import',p_manifest);
$$;
revoke all on function private.atlas_engine_request_team_internal(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.atlas_engine_request_team_internal(uuid,uuid,uuid,uuid,jsonb) to authenticated;
create function public.atlas_engine_request_team(
 p_workspace_id uuid,p_instance_id uuid,p_mission_id uuid,p_request_id uuid,p_manifest jsonb)
returns table(run_id uuid,intent_digest text,decision text,expires_at timestamptz,created boolean,can_dispatch boolean)
language sql volatile security invoker set search_path='' as $$
 select * from private.atlas_engine_request_team_internal(p_workspace_id,p_instance_id,p_mission_id,p_request_id,p_manifest);
$$;
revoke all on function public.atlas_engine_request_team(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.atlas_engine_request_team(uuid,uuid,uuid,uuid,jsonb) to authenticated;
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
 where r.primitive_id in('agents.create','teams.import');
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
