-- SHA-150 preconnection intent binding. PREVIEW until PostgreSQL CI green.
-- Does not enable engine execution or publish private approval tables.
-- The connected ATLAS project was inspected with 0 runs / approvals.
do $$
begin
 if exists(select 1 from public.atlas_engine_runs limit 1)
   or exists(select 1 from private.atlas_engine_approvals limit 1) then
   raise exception 'ENGINE_APPROVAL_INTENT_EMPTY_BASELINE_REQUIRED'
    using errcode='23514';
 end if;
 if to_regprocedure('extensions.digest(bytea,text)') is null then
   raise exception 'ENGINE_PGCRYPTO_EXTENSION_REQUIRED' using errcode='55000';
 end if;
end $$;

alter table public.atlas_engine_runs
 add column payload_sha256 text not null
 check (payload_sha256 ~ '^[a-f0-9]{64}$');

alter table private.atlas_engine_approvals
 add column intent_digest text not null
 check (intent_digest ~ '^[a-f0-9]{64}$');

-- All fields are fixed-width or have a validated alphabet excluding newlines.
-- Match JavaScript join('\n') exactly. No raw request payload is stored.
create function private.atlas_engine_intent_digest(
 _workspace uuid,_instance uuid,_run uuid,_mission uuid,
 _primitive text,_payload_sha256 text
) returns text
language sql immutable strict set search_path='' as $$
 select encode(extensions.digest(
   convert_to(
     'atlas-engine-approval-v1' || E'\n' ||
     _workspace::text || E'\n' ||
     _instance::text || E'\n' ||
     _run::text || E'\n' ||
     _mission::text || E'\n' ||
     _primitive || E'\n' ||
     _payload_sha256,
     'UTF8'
   ),'sha256'
 ),'hex');
$$;
revoke all on function private.atlas_engine_intent_digest(uuid,uuid,uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function private.atlas_engine_intent_digest(uuid,uuid,uuid,uuid,text,text)
 to service_role;

-- Neither a service-role application nor a stale approval can repurpose a run
-- after creation; state transitions and updated_at remain separately tracked.
create function private.atlas_engine_run_immutable_intent()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.workspace_id is distinct from old.workspace_id or
    new.instance_id is distinct from old.instance_id or
    new.id is distinct from old.id or
    new.mission_id is distinct from old.mission_id or
    new.requested_by is distinct from old.requested_by or
    new.primitive_id is distinct from old.primitive_id or
    new.payload_sha256 is distinct from old.payload_sha256 then
   raise exception 'ENGINE_RUN_INTENT_IMMUTABLE' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.atlas_engine_run_immutable_intent() from public,anon,authenticated;
create trigger atlas_engine_run_immutable_intent before update
 on public.atlas_engine_runs for each row
 execute function private.atlas_engine_run_immutable_intent();

create function private.atlas_engine_approval_digest_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare expected text;
begin
 if tg_op='UPDATE' and
   new.intent_digest is distinct from old.intent_digest then
   raise exception 'ENGINE_APPROVAL_DIGEST_IMMUTABLE' using errcode='42501';
 end if;
 select private.atlas_engine_intent_digest(
    r.workspace_id,r.instance_id,r.id,r.mission_id,
    r.primitive_id,r.payload_sha256
 ) into expected from public.atlas_engine_runs r
 where r.workspace_id=new.workspace_id and r.instance_id=new.instance_id
   and r.id=new.run_id;
 if expected is null or new.intent_digest is distinct from expected then
   raise exception 'ENGINE_APPROVAL_INTENT_MISMATCH' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.atlas_engine_approval_digest_guard() from public,anon,authenticated;
create trigger atlas_engine_approval_digest_guard
 before insert or update on private.atlas_engine_approvals
 for each row execute function private.atlas_engine_approval_digest_guard();

comment on column public.atlas_engine_runs.payload_sha256 is
 'SHA-256 of trusted immutable run input, no raw input or credentials';
comment on column private.atlas_engine_approvals.intent_digest is
 'SHA-256 binding to immutable workspace/instance/run/mission/primitive/payload';
