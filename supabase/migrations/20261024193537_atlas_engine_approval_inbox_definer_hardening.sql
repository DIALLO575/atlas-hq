-- Revision: move privileged implementation into non-exposed private schema.
-- Public authenticated RPC is SECURITY INVOKER only; all row/session checks
-- remain inside the internal function, and no private table SELECT is granted.
create function private.atlas_engine_pending_approvals_internal(p_workspace_id uuid)
returns table(run_id uuid,instance_id uuid,mission_id uuid,
 primitive_id text,intent_digest text,requested_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select a.run_id,a.instance_id,r.mission_id,r.primitive_id,a.intent_digest,
 a.created_at,a.expires_at
 from private.atlas_engine_approvals a
 join public.atlas_engine_runs r on r.workspace_id=a.workspace_id
  and r.id=a.run_id and r.instance_id=a.instance_id
 where p_workspace_id is not null and a.workspace_id=p_workspace_id
 and a.decision='pending' and a.expires_at>now()
 and auth.uid() is not null and a.requested_by<>auth.uid()
 and exists(select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=auth.uid()
    and m.role in ('owner','admin'))
 and exists(select 1 from auth.sessions s
    where s.user_id=auth.uid()
    and s.id=(case when (auth.jwt()->>'session_id') ~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (auth.jwt()->>'session_id')::uuid else null::uuid end)
    and (s.not_after is null or s.not_after>now()))
 order by a.created_at,a.run_id limit 50
$$;

revoke all on function private.atlas_engine_pending_approvals_internal(uuid)
 from public,anon,authenticated;
grant execute on function private.atlas_engine_pending_approvals_internal(uuid)
 to authenticated;
create or replace function public.atlas_engine_pending_approvals(p_workspace_id uuid)
 returns table(run_id uuid,instance_id uuid,mission_id uuid,
 primitive_id text,intent_digest text,requested_at timestamptz,expires_at timestamptz)
 language sql stable security invoker set search_path='' as $$
 select * from private.atlas_engine_pending_approvals_internal(p_workspace_id);
 $$;
revoke all on function public.atlas_engine_pending_approvals(uuid)
 from public,anon,authenticated;
grant execute on function public.atlas_engine_pending_approvals(uuid)
 to authenticated;
comment on function public.atlas_engine_pending_approvals(uuid) is
 'SECURITY INVOKER wrapper: session-scoped pending inbox, no decisions or payloads';
comment on function private.atlas_engine_pending_approvals_internal(uuid) is
 'Non-exposed SECURITY DEFINER: checks live auth.sessions, current workspace admin, pending and no self-review';
