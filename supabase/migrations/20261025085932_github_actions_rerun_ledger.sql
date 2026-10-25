-- GitHub Actions: auditable, single-dispatch rerun of one failed job.
-- Service-role-only operations, no public browser grants.
create table public.atlas_github_actions_reruns (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 installation_id bigint not null references public.atlas_github_installations(installation_id),
 repository_id bigint not null check(repository_id>0),
 run_id bigint not null check(run_id>0),
 job_id bigint not null check(job_id>0),
 run_attempt integer not null check(run_attempt between 1 and 50),
 head_sha text not null check(head_sha ~ '^[0-9a-f]{40}$'),
 idempotency_key uuid not null,
 state text not null default 'reserved' check(state in ('reserved','dispatching','accepted','reconciliation_required','rejected')),
 failure_code text check(failure_code is null or failure_code ~ '^[A-Z_]{2,48}$'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,actor_id,idempotency_key),
 unique(installation_id,repository_id,job_id,run_attempt)
);
create index atlas_github_actions_reruns_workspace_idx on public.atlas_github_actions_reruns(workspace_id,created_at desc);
create table public.atlas_github_actions_rerun_audit (
 id uuid primary key default gen_random_uuid(),
 rerun_id uuid not null references public.atlas_github_actions_reruns(id),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 old_state text,
 new_state text not null,
 event_at timestamptz not null default clock_timestamp()
);
create index atlas_github_actions_rerun_audit_ws_idx on public.atlas_github_actions_rerun_audit(workspace_id,event_at desc);
alter table public.atlas_github_actions_reruns enable row level security;
alter table public.atlas_github_actions_rerun_audit enable row level security;
revoke all on public.atlas_github_actions_reruns,public.atlas_github_actions_rerun_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.atlas_github_actions_reruns to service_role;
grant select,insert on public.atlas_github_actions_rerun_audit to service_role;

create function public.atlas_gh_actions_reserve(
 p_workspace_id uuid,p_actor_id uuid,p_installation_id bigint,p_repository_id bigint,
 p_run_id bigint,p_job_id bigint,p_run_attempt integer,p_head_sha text,p_idempotency_key uuid
) returns table(operation_id uuid,operation_state text,already_exists boolean)
language plpgsql volatile security invoker set search_path='' as $$
declare v_operation public.atlas_github_actions_reruns%rowtype;
begin
 if p_workspace_id is null or p_actor_id is null or p_idempotency_key is null or
    p_repository_id is null or p_repository_id<=0 or p_job_id is null or p_job_id<=0 or
    p_run_id is null or p_run_id<=0 or p_run_attempt not between 1 and 50 or
    p_head_sha is null or p_head_sha !~ '^[0-9a-f]{40}$' then
   raise exception 'INVALID_ACTIONS_REQUEST' using errcode='22023';
 end if;
 if not exists(select 1 from public.workspace_members m
   where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role in ('owner','admin')) then
   raise exception 'ACTIONS_WORKSPACE_FORBIDDEN' using errcode='42501';
 end if;
 if not exists(select 1 from public.atlas_github_installations i
   where i.installation_id=p_installation_id and i.workspace_id=p_workspace_id
     and i.status='repositories-ready' and i.ownership_verified_at is not null
     and i.repositories_verified_at is not null and i.repository_selection in ('selected','all')
     and (i.repository_selection='all' or exists(
       select 1 from public.atlas_github_authorized_repositories r
       where r.installation_id=i.installation_id and r.repository_id=p_repository_id))) then
   raise exception 'ACTIONS_REPO_FORBIDDEN' using errcode='42501';
 end if;
 insert into public.atlas_github_actions_reruns
 (workspace_id,actor_id,installation_id,repository_id,run_id,job_id,run_attempt,head_sha,idempotency_key)
 values(p_workspace_id,p_actor_id,p_installation_id,p_repository_id,p_run_id,p_job_id,p_run_attempt,p_head_sha,p_idempotency_key)
 on conflict (workspace_id,actor_id,idempotency_key) do nothing returning * into v_operation;
 if found then
   insert into public.atlas_github_actions_rerun_audit(rerun_id,workspace_id,actor_id,new_state)
     values(v_operation.id,p_workspace_id,p_actor_id,'reserved');
   return query select v_operation.id,v_operation.state,false;return;
 end if;
 select * into v_operation from public.atlas_github_actions_reruns o
 where o.workspace_id=p_workspace_id and o.actor_id=p_actor_id and o.idempotency_key=p_idempotency_key;
 if v_operation.id is null or v_operation.installation_id<>p_installation_id
    or v_operation.repository_id<>p_repository_id or v_operation.run_id<>p_run_id
    or v_operation.job_id<>p_job_id or v_operation.run_attempt<>p_run_attempt
    or v_operation.head_sha<>p_head_sha then
    raise exception 'ACTIONS_IDEMPOTENCY_CONFLICT' using errcode='23505';
 end if;
 return query select v_operation.id,v_operation.state,true;
end$$;
create function public.atlas_gh_actions_advance(
 p_operation_id uuid,p_expected_state text,p_next_state text,p_failure_code text default null
) returns text language plpgsql volatile security invoker set search_path='' as $$
declare v_op public.atlas_github_actions_reruns%rowtype;
begin
 select * into v_op from public.atlas_github_actions_reruns where id=p_operation_id for update;
 if v_op.id is null then raise exception 'ACTIONS_OPERATION_MISSING' using errcode='22023'; end if;
 if v_op.state<>p_expected_state then raise exception 'ACTIONS_STATE_CONFLICT' using errcode='40001'; end if;
 if not ((v_op.state='reserved' and p_next_state in ('dispatching','rejected'))
     or (v_op.state='dispatching' and p_next_state in ('accepted','reconciliation_required'))) then
   raise exception 'ACTIONS_TRANSITION_FORBIDDEN' using errcode='22023';
 end if;
 if p_failure_code is not null and p_failure_code !~ '^[A-Z_]{2,48}$' then
   raise exception 'ACTIONS_INVALID_CODE' using errcode='22023';
 end if;
 update public.atlas_github_actions_reruns set state=p_next_state,failure_code=p_failure_code,
   updated_at=clock_timestamp() where id=v_op.id;
 insert into public.atlas_github_actions_rerun_audit
 (rerun_id,workspace_id,actor_id,old_state,new_state)
 values(v_op.id,v_op.workspace_id,v_op.actor_id,v_op.state,p_next_state);
 return p_next_state;
end$$;

revoke all on function public.atlas_gh_actions_reserve(uuid,uuid,bigint,bigint,bigint,bigint,integer,text,uuid)
 from public,anon,authenticated;
revoke all on function public.atlas_gh_actions_advance(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.atlas_gh_actions_reserve(uuid,uuid,bigint,bigint,bigint,bigint,integer,text,uuid) to service_role;
grant execute on function public.atlas_gh_actions_advance(uuid,text,text,text) to service_role;
