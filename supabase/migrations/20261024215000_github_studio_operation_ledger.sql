-- SHA-154 / GitHub Studio V1. Applied only after sandbox validation and explicit GO.
-- No public mutation API enabled by this migration. Only service_role invokes RPCs.
create table public.atlas_github_studio_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  installation_id bigint not null references public.atlas_github_installations(installation_id),
  idempotency_key uuid not null,
  intent_digest text not null check (intent_digest ~ '^[0-9a-f]{64}$'),
  repository_name text not null check (repository_name ~ '^[A-Za-z0-9_.-]{1,100}$'
    and repository_name not in ('.','..')),
  visibility text not null check (visibility in ('private','public')),
  operation text not null default 'repository.create' check(operation='repository.create'),
  state text not null default 'prepared' check(state in
   ('prepared','dispatching','provider_confirmed','reconciliation_required','succeeded','failed')),
  repository_id bigint check (repository_id is null or repository_id > 0),
  error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, actor_id, idempotency_key),
  constraint gh_studio_success_has_repository check (state <> 'succeeded' or repository_id is not null)
);
create index atlas_gh_studio_ops_workspace_idx
  on public.atlas_github_studio_operations(workspace_id,created_at desc);
-- A second browser action with a NEW UUID must not dispatch the SAME repository name.
-- Keep completed names reserved; only pre-dispatch failed intents can free the name.
create unique index atlas_gh_studio_repo_name_single_flight
  on public.atlas_github_studio_operations(workspace_id,installation_id,lower(repository_name))
  where state<>'failed';
create table public.atlas_github_studio_audit (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.atlas_github_studio_operations(id),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  installation_id bigint not null,
  action text not null check(action='repository.create'),
  state text not null check(state in
   ('prepared','dispatching','provider_confirmed','reconciliation_required','succeeded','failed')),
  error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  event_at timestamptz not null default clock_timestamp()
);
create index atlas_gh_studio_audit_workspace_idx
  on public.atlas_github_studio_audit(workspace_id,event_at desc);

alter table public.atlas_github_studio_operations enable row level security;
alter table public.atlas_github_studio_audit enable row level security;
revoke all on public.atlas_github_studio_operations,public.atlas_github_studio_audit
 from public,anon,authenticated,service_role;
grant select,insert,update on public.atlas_github_studio_operations to service_role;
grant select,insert on public.atlas_github_studio_audit to service_role;
-- No RLS SELECT policies for browser roles. No secrets or provider payloads stored.

-- Atomic reserve under unique key. A retry with changed payload or installation
-- raises; a retry of the same intent only returns the persisted existing state.
create function public.atlas_gh_studio_reserve(
 p_workspace_id uuid,p_actor_id uuid,p_installation_id bigint,
 p_idempotency_key uuid,p_repository_name text,p_visibility text,p_digest text
) returns table(operation_id uuid,operation_state text,already_exists boolean)
 language plpgsql volatile security invoker set search_path='' as $$
declare v_id uuid; v_record record; v_existing boolean := true;
begin
 if p_workspace_id is null or p_actor_id is null or p_idempotency_key is null
    or p_installation_id is null or p_installation_id<=0
    or p_repository_name is null or p_repository_name !~ '^[A-Za-z0-9_.-]{1,100}$'
    or p_repository_name in('.','..') or p_visibility not in('private','public')
    or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from public.workspace_members m
      where m.workspace_id=p_workspace_id and m.user_id=p_actor_id
        and m.role in('owner','admin'))
    or not exists(select 1 from public.atlas_github_installations i
      where i.workspace_id=p_workspace_id and i.installation_id=p_installation_id
        and i.status='repositories-ready'
        and i.repository_selection in('selected','all')
        and i.ownership_verified_at is not null
        and i.repositories_verified_at is not null)
 then raise exception 'GH_STUDIO_DENIED' using errcode='42501'; end if;

 insert into public.atlas_github_studio_operations(
   workspace_id,actor_id,installation_id,idempotency_key,repository_name,visibility,intent_digest)
 values(p_workspace_id,p_actor_id,p_installation_id,p_idempotency_key,
   p_repository_name,p_visibility,p_digest)
 on conflict(workspace_id,actor_id,idempotency_key) do nothing
 returning id into v_id;
 if v_id is not null then
   v_existing := false;
   insert into public.atlas_github_studio_audit(
      operation_id,workspace_id,actor_id,installation_id,action,state)
   values(v_id,p_workspace_id,p_actor_id,p_installation_id,'repository.create','prepared');
 end if;
 -- Wait for concurrent insert to commit before looking at the unique row.
 select o.id,o.state,o.intent_digest,o.repository_name,o.visibility,o.installation_id
 into v_record from public.atlas_github_studio_operations o
 where o.workspace_id=p_workspace_id and o.actor_id=p_actor_id
    and o.idempotency_key=p_idempotency_key for update;
 if not found then raise exception 'GH_STUDIO_RESERVE_RACE' using errcode='40001';end if;
 if v_record.intent_digest<>p_digest or v_record.installation_id<>p_installation_id
   or v_record.repository_name<>p_repository_name or v_record.visibility<>p_visibility
 then raise exception 'GH_STUDIO_IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 return query select v_record.id,v_record.state,v_existing;
end $$;

-- Only the server-side integration calls advance after a trusted GitHub result.
-- SELECT FOR UPDATE + expected state = concurrent fencing for all transitions.
create function public.atlas_gh_studio_advance(
 p_operation_id uuid,p_expected_state text,p_next_state text,
 p_repository_id bigint default null,p_error_code text default null
) returns text
 language plpgsql volatile security invoker set search_path='' as $$
declare v record; v_repository bigint; v_changes integer;
begin
 if p_operation_id is null or p_expected_state is null or p_next_state is null
   or (p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$')
 then raise exception 'GH_STUDIO_INVALID_TRANSITION' using errcode='22023'; end if;
 select o.* into v from public.atlas_github_studio_operations o
    where o.id=p_operation_id for update;
 if not found or v.state<>p_expected_state or
   not (
      (p_expected_state='prepared' and p_next_state in('dispatching','failed'))
      or (p_expected_state='dispatching' and p_next_state in('provider_confirmed','reconciliation_required'))
      or (p_expected_state='provider_confirmed' and p_next_state='reconciliation_required')
   ) then raise exception 'GH_STUDIO_INVALID_TRANSITION' using errcode='40001';end if;

 if not exists(select 1 from public.workspace_members m
     where m.workspace_id=v.workspace_id and m.user_id=v.actor_id
       and m.role in('owner','admin'))
    or not exists(select 1 from public.atlas_github_installations i
     where i.workspace_id=v.workspace_id and i.installation_id=v.installation_id
       and i.status='repositories-ready') then
   -- When authorization is revoked, even an uncertain outcome needs operator
   -- reconciliation; NEVER retry the provider write.
   raise exception 'GH_STUDIO_AUTH_REVOKED' using errcode='42501';
 end if;

 v_repository := coalesce(p_repository_id,v.repository_id);
 if p_repository_id is not null and (p_repository_id<=0 or
    (v.repository_id is not null and v.repository_id<>p_repository_id)) then
    raise exception 'GH_STUDIO_REPOSITORY_CONFLICT' using errcode='22023';
 end if;
 if p_next_state in ('provider_confirmed','succeeded') and v_repository is null then
   raise exception 'GH_STUDIO_REPOSITORY_REQUIRED' using errcode='22023';end if;
 if p_next_state='succeeded' and
   not exists(select 1 from public.atlas_github_installations i
     where i.workspace_id=v.workspace_id and i.installation_id=v.installation_id
       and (
         i.repository_selection='all' or exists(
           select 1 from public.atlas_github_authorized_repositories r
           where r.installation_id=v.installation_id and r.repository_id=v_repository
         )
       )) then
   raise exception 'GH_STUDIO_RECONCILIATION_REQUIRED' using errcode='42501';
 end if;
 update public.atlas_github_studio_operations o
 set state=p_next_state,repository_id=v_repository,
     error_code=p_error_code,updated_at=clock_timestamp()
 where o.id=p_operation_id and o.state=p_expected_state;
 get diagnostics v_changes=row_count;
 if v_changes<>1 then raise exception 'GH_STUDIO_CAS_FAILED' using errcode='40001';end if;
 insert into public.atlas_github_studio_audit(
  operation_id,workspace_id,actor_id,installation_id,action,state,error_code)
 values(p_operation_id,v.workspace_id,v.actor_id,v.installation_id,
  v.operation,p_next_state,p_error_code);
 return p_next_state;
end $$;

revoke all on function public.atlas_gh_studio_reserve(uuid,uuid,bigint,uuid,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.atlas_gh_studio_reserve(uuid,uuid,bigint,uuid,text,text,text)
 to service_role;
revoke all on function public.atlas_gh_studio_advance(uuid,text,text,bigint,text)
 from public,anon,authenticated,service_role;
grant execute on function public.atlas_gh_studio_advance(uuid,text,text,bigint,text)
 to service_role;

-- SHA-155: this is the ONLY path to mark a creation as succeeded.
-- Caller must separately verify the newly created repository and its effective
-- installation grant using a fresh GitHub API read immediately beforehand.
-- The DB does NOT assert provider verification; service_role is the trust boundary.
-- The exact numeric provider repository ID MUST already be confirmed on the intent.
create function public.atlas_gh_studio_finalize_repository(
 p_operation_id uuid,p_repository_id bigint
) returns boolean
 language plpgsql volatile security invoker set search_path='' as $$
declare v record; v_actor uuid; v_installation record; v_rows integer;
begin
 if p_operation_id is null or p_repository_id is null or p_repository_id<=0 then
   raise exception 'GH_STUDIO_FINALIZE_INVALID' using errcode='22023';
 end if;
 -- Serialize against concurrent finalizers and advance() for this operation.
 -- Membership and installation must be freshly checked; authorization updates
 -- are guarded by the server-side live provider validation before this RPC.
 select o.* into v from public.atlas_github_studio_operations o
 where o.id=p_operation_id for update;
 if not found or v.state not in('provider_confirmed','reconciliation_required')
   or v.repository_id is distinct from p_repository_id then
   raise exception 'GH_STUDIO_FINALIZE_CONFLICT' using errcode='40001';
 end if;

 select m.user_id into v_actor from public.workspace_members m
 where m.workspace_id=v.workspace_id and m.user_id=v.actor_id
   and m.role in('owner','admin');
 if v_actor is null then
   raise exception 'GH_STUDIO_FINALIZE_REVOKED' using errcode='42501';
 end if;
 select i.installation_id,i.repository_selection into v_installation
 from public.atlas_github_installations i
 where i.workspace_id=v.workspace_id and i.installation_id=v.installation_id
   and i.status='repositories-ready'
   and i.repository_selection in('selected','all')
   and i.ownership_verified_at is not null
   and i.repositories_verified_at is not null
 for share;
 if not found then
   raise exception 'GH_STUDIO_FINALIZE_REVOKED' using errcode='42501';
 end if;

 -- In selected mode the trusted server must have JUST checked the live
 -- installation repository grant for this exact ID. The transaction then
 -- records that verified link and the terminal state together.
 if v_installation.repository_selection='selected' then
   insert into public.atlas_github_authorized_repositories(
     installation_id,repository_id) values(v.installation_id,p_repository_id)
   on conflict(installation_id,repository_id) do nothing;
 end if;
 update public.atlas_github_studio_operations o
 set state='succeeded',updated_at=clock_timestamp(),error_code=null
 where o.id=p_operation_id and o.state=v.state
   and o.repository_id=p_repository_id;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then
   raise exception 'GH_STUDIO_FINALIZE_CONFLICT' using errcode='40001';
 end if;
 insert into public.atlas_github_studio_audit(
  operation_id,workspace_id,actor_id,installation_id,action,state)
 values(p_operation_id,v.workspace_id,v.actor_id,v.installation_id,
        'repository.create','succeeded');
 return true;
end $$;
revoke all on function public.atlas_gh_studio_finalize_repository(uuid,bigint)
 from public,anon,authenticated,service_role;
grant execute on function public.atlas_gh_studio_finalize_repository(uuid,bigint)
 to service_role;

