-- SHA-175: ADDITIVE n8n metadata registry. No n8n network traffic, jobs or activation.
-- Apply once after PostgreSQL 17 disposable RLS/FK tests pass. No client writes.
-- The official database contains existing public.atlas_engine_instances & atlas_missions.
-- Distinguish n8n instance identity at the database level, not just via BFF filtering.
create unique index atlas_engine_instances_tenant_provider_uidx
 on public.atlas_engine_instances(workspace_id,id,engine_key);

create table public.atlas_automation_workflows (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 instance_id uuid not null,
 engine_key text not null default 'n8n' check (engine_key = 'n8n'),
 remote_workflow_id text not null
   check(remote_workflow_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 name text not null check(length(name) between 1 and 160),
 remote_active boolean,
 sync_state text not null default 'unverified'
   check(sync_state in ('unverified','observed','missing')),
 remote_created_at timestamptz,
 remote_updated_at timestamptz,
 last_seen_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint atlas_automation_workflows_provider_fk
   foreign key(workspace_id,instance_id,engine_key)
   references public.atlas_engine_instances(workspace_id,id,engine_key),
 constraint atlas_automation_workflows_remote_unique
   unique(workspace_id,instance_id,remote_workflow_id),
 constraint atlas_automation_workflows_instance_id_unique
   unique(workspace_id,instance_id,id),
 constraint atlas_automation_workflows_seen_state_check
   check(sync_state <> 'observed' or last_seen_at is not null)
);
create index atlas_automation_workflows_workspace_idx
 on public.atlas_automation_workflows(workspace_id,instance_id,updated_at desc,id);
alter table public.atlas_automation_workflows enable row level security;
revoke all on table public.atlas_automation_workflows from public,anon,authenticated;
grant select on table public.atlas_automation_workflows to authenticated;
grant select,insert,update on table public.atlas_automation_workflows to service_role;
create policy atlas_automation_workflows_read on public.atlas_automation_workflows
 for select to authenticated using(private.is_workspace_member(workspace_id));
comment on table public.atlas_automation_workflows is
 'Workspace-scoped n8n workflow METADATA only. Source remains n8n; no browser writes or provider credentials.';

-- Autonomous n8n executions are not forced into mission-bound atlas_engine_runs.
-- This ledger carries no payload, prompt, workflow graph or execution output.
create table public.atlas_automation_executions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 instance_id uuid not null,
 workflow_id uuid not null,
 remote_execution_id text not null
   check(remote_execution_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 mission_id uuid,
 status text not null default 'unknown'
   check(status in ('unknown','new','running','waiting','success','error','canceled')),
 finished boolean,
 started_at timestamptz,
 stopped_at timestamptz,
 last_seen_at timestamptz,
 created_at timestamptz not null default now(),
 constraint atlas_automation_executions_workflow_fk
   foreign key(workspace_id,instance_id,workflow_id)
   references public.atlas_automation_workflows(workspace_id,instance_id,id),
 constraint atlas_automation_executions_mission_fk
   foreign key(mission_id,workspace_id)
   references public.atlas_missions(id,workspace_id),
 constraint atlas_automation_executions_remote_unique
   unique(workspace_id,instance_id,remote_execution_id),
 constraint atlas_automation_executions_time_check
   check(stopped_at is null or started_at is null or stopped_at >= started_at)
);
create index atlas_automation_executions_workspace_idx
 on public.atlas_automation_executions(workspace_id,instance_id,created_at desc,id);
create index atlas_automation_executions_workflow_idx
 on public.atlas_automation_executions(workspace_id,instance_id,workflow_id,created_at desc);
alter table public.atlas_automation_executions enable row level security;
revoke all on table public.atlas_automation_executions from public,anon,authenticated;
grant select on table public.atlas_automation_executions to authenticated;
grant select,insert,update on table public.atlas_automation_executions to service_role;
create policy atlas_automation_executions_read on public.atlas_automation_executions
 for select to authenticated using(private.is_workspace_member(workspace_id));
comment on table public.atlas_automation_executions is
 'Observed n8n execution METADATA. No dispatch, payloads, arbitrary remote output, client writes or mission requirement.';
