-- SHA-150 — one-time human decision, atomically persisted with audit.
-- Does NOT enqueue outbox, authorize a run or dispatch MAUSBOT.
-- The public RPC is SECURITY INVOKER and authenticated-only.
-- All sensitive table access and live-session verification happen in private.
create function private.atlas_engine_decide_approval_internal(
 p_workspace_id uuid,p_run_id uuid,p_intent_digest text,p_decision text
) returns table(run_id uuid,decision text,can_dispatch boolean)
 language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid := auth.uid();
 sid_text text := auth.jwt()->>'session_id';
 sid uuid;
 record_data record;
 modified integer;
 digest_actual text;
begin
 if p_workspace_id is null or p_run_id is null
    or p_decision is null or p_decision not in('approved','rejected')
    or p_intent_digest is null or p_intent_digest !~ '^[a-f0-9]{64}$'
    or actor is null then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 if sid_text is null or sid_text !~
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 sid := sid_text::uuid;
 -- Fresh, trusted session and *current* role. No JWT user_metadata role.
 if not exists(select 1 from auth.sessions s where s.user_id=actor and s.id=sid
      and (s.not_after is null or s.not_after > clock_timestamp())
      for share)
 or not exists(select 1 from public.workspace_members m where
      m.workspace_id=p_workspace_id and m.user_id=actor
      and m.role in('owner','admin') for share) then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 -- Row locks serialize parallel reviewers, including concurrent workers.
 select a.workspace_id,a.instance_id,a.run_id,a.requested_by,
     a.decision,a.intent_digest,a.expires_at,
     r.mission_id,r.primitive_id,r.payload_sha256,r.state as run_state
 into record_data
 from private.atlas_engine_approvals a
 join public.atlas_engine_runs r on r.workspace_id=a.workspace_id
   and r.id=a.run_id and r.instance_id=a.instance_id
 where a.workspace_id=p_workspace_id and a.run_id=p_run_id
 for update of a,r;
 if not found or record_data.decision<>'pending'
    or record_data.expires_at<=clock_timestamp()
    or record_data.requested_by=actor
    or record_data.run_state not in('draft','awaiting-approval') then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 digest_actual := private.atlas_engine_intent_digest(
   record_data.workspace_id,record_data.instance_id,record_data.run_id,
   record_data.mission_id,record_data.primitive_id,record_data.payload_sha256);
 if record_data.intent_digest is distinct from digest_actual
    or record_data.intent_digest is distinct from p_intent_digest then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 -- Revalidate the session and membership after acquiring locks.
 if not exists(select 1 from auth.sessions s where s.user_id=actor and s.id=sid
       and (s.not_after is null or s.not_after>clock_timestamp()))
    or not exists(select 1 from public.workspace_members m where
       m.workspace_id=p_workspace_id and m.user_id=actor and m.role in('owner','admin')) then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 update private.atlas_engine_approvals a
 set decision=p_decision,decided_by=actor,decided_at=clock_timestamp()
 where a.workspace_id=p_workspace_id and a.run_id=p_run_id and a.decision='pending'
   and a.expires_at>clock_timestamp();
 get diagnostics modified = row_count;
 if modified<>1 then
  raise exception 'ENGINE_APPROVAL_NOT_AVAILABLE' using errcode='42501';
 end if;
 -- The audit INSERT is in the *same PostgreSQL statement/transaction*.
 -- Any error (including FK/trigger errors) rolls back the approval update.
 insert into private.atlas_engine_audit_events(
  workspace_id,instance_id,run_id,actor_id,event_key,payload_digest)
 values(record_data.workspace_id,record_data.instance_id,record_data.run_id,
  actor,case when p_decision='approved' then 'engine.approval.approved'
             else 'engine.approval.rejected' end,record_data.intent_digest);
 return query select p_run_id,p_decision,false;
end $$;
revoke all on function private.atlas_engine_decide_approval_internal(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function private.atlas_engine_decide_approval_internal(uuid,uuid,text,text)
 to authenticated;

create function public.atlas_engine_decide_approval(
 p_workspace_id uuid,p_run_id uuid,p_intent_digest text,p_decision text
) returns table(run_id uuid,decision text,can_dispatch boolean)
 language sql volatile security invoker set search_path='' as $$
 select * from private.atlas_engine_decide_approval_internal(
  p_workspace_id,p_run_id,p_intent_digest,p_decision);
$$;
revoke all on function public.atlas_engine_decide_approval(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.atlas_engine_decide_approval(uuid,uuid,text,text)
 to authenticated;
comment on function public.atlas_engine_decide_approval(uuid,uuid,text,text) is
 'Human one-time approval/rejection, live auth session, exact intent, atomic audit. NEVER dispatches.';
