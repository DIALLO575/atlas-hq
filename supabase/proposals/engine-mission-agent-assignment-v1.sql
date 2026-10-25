-- SHA127/128/132 additive proposal; disposable PostgreSQL only.
-- NOT applied to any Supabase project. No client/API write path is installed.
-- Promotion requires a reviewed CLI migration after history/advisor checks.
create table private.atlas_engine_mission_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, mission_id uuid not null, instance_id uuid not null,
  atlas_agent_key text not null, remote_agent_key text not null check(remote_agent_key ~ '^[A-Za-z0-9_-]{1,120}$'),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), version integer not null default 1 check(version=1),
  revoked_at timestamptz, revoked_by uuid references auth.users(id) on delete restrict,
  check ((revoked_at is null)=(revoked_by is null)),
  check (revoked_at is null or revoked_at>=created_at),
  unique(id,workspace_id),
  unique(id,workspace_id,mission_id,instance_id,atlas_agent_key),
  foreign key(mission_id,workspace_id) references public.atlas_missions(id,workspace_id) on delete restrict,
  foreign key(workspace_id,instance_id,atlas_agent_key)
    references private.atlas_engine_agent_bindings(workspace_id,instance_id,atlas_agent_key) on update restrict on delete restrict,
  foreign key(workspace_id,assigned_by) references public.workspace_members(workspace_id,user_id) on delete restrict
);
create unique index atlas_engine_mission_agents_one_active
  on private.atlas_engine_mission_agents(workspace_id,mission_id,atlas_agent_key) where revoked_at is null;
create index atlas_engine_mission_agents_run_lookup
  on private.atlas_engine_mission_agents(workspace_id,mission_id,instance_id,atlas_agent_key) where revoked_at is null;
alter table private.atlas_engine_mission_agents enable row level security;
revoke all on private.atlas_engine_mission_agents from public,anon,authenticated;
grant select,insert,update on private.atlas_engine_mission_agents to service_role;

create table private.atlas_engine_mission_agent_primitives (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, mission_agent_id uuid not null,
  primitive_id text not null check(primitive_id in('conversations.messages.list','conversations.messages.send')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  check ((revoked_at is null)=(revoked_by is null)),
  check (revoked_at is null or revoked_at>=created_at),
  foreign key(mission_agent_id,workspace_id) references private.atlas_engine_mission_agents(id,workspace_id) on delete restrict,
  foreign key(workspace_id,granted_by) references public.workspace_members(workspace_id,user_id) on delete restrict,
  foreign key(workspace_id,revoked_by) references public.workspace_members(workspace_id,user_id) on delete restrict
);
create unique index atlas_engine_mission_agent_primitives_one_active
  on private.atlas_engine_mission_agent_primitives(mission_agent_id,primitive_id) where revoked_at is null;
create index atlas_engine_mission_agent_primitives_lookup
  on private.atlas_engine_mission_agent_primitives(mission_agent_id,primitive_id) where revoked_at is null;
alter table private.atlas_engine_mission_agent_primitives enable row level security;
revoke all on private.atlas_engine_mission_agent_primitives from public,anon,authenticated;
grant select,insert,update on private.atlas_engine_mission_agent_primitives to service_role;

create function private.atlas_engine_mission_assignment_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid; event_key text; payload text; event_workspace uuid; event_instance uuid;
begin
 if tg_op='DELETE' then raise exception 'ENGINE_MISSION_ASSIGNMENT_IMMUTABLE' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if to_jsonb(new)-'revoked_at'-'revoked_by' is distinct from to_jsonb(old)-'revoked_at'-'revoked_by'
   or old.revoked_at is not null or new.revoked_at is null or new.revoked_by is null then
    raise exception 'ENGINE_MISSION_ASSIGNMENT_IMMUTABLE' using errcode='42501';
  end if;
  actor:=new.revoked_by;
  if tg_table_name='atlas_engine_mission_agents' then event_key:='engine.mission_agent.revoked';
  else event_key:='engine.mission_agent.primitive.revoked'; end if;
 else
  if tg_table_name='atlas_engine_mission_agents' then actor:=new.assigned_by;event_key:='engine.mission_agent.assigned';
  else actor:=new.granted_by;event_key:='engine.mission_agent.primitive.granted'; end if;
 end if;
 if tg_table_name='atlas_engine_mission_agents' then
  payload:=concat_ws('|',new.id,new.workspace_id,new.mission_id,new.instance_id,new.atlas_agent_key,new.remote_agent_key,new.version,new.revoked_at);
  insert into private.atlas_engine_audit_events(workspace_id,instance_id,actor_id,event_key,payload_digest)
  values(new.workspace_id,new.instance_id,actor,event_key,encode(extensions.digest(convert_to(payload,'UTF8'),'sha256'),'hex'));
 else
  select concat_ws('|',m.id,m.workspace_id,m.mission_id,m.instance_id,m.atlas_agent_key,m.remote_agent_key,new.primitive_id,new.revoked_at),
    m.workspace_id,m.instance_id into payload,event_workspace,event_instance
    from private.atlas_engine_mission_agents m where m.id=new.mission_agent_id;
  if not found then raise exception 'ENGINE_MISSION_ASSIGNMENT_REQUIRED' using errcode='23503'; end if;
  insert into private.atlas_engine_audit_events(workspace_id,instance_id,actor_id,event_key,payload_digest)
  values(event_workspace,event_instance,actor,event_key,encode(extensions.digest(convert_to(payload,'UTF8'),'sha256'),'hex'));
 end if;
 return new;
end $$;
revoke all on function private.atlas_engine_mission_assignment_guard() from public,anon,authenticated;
create trigger atlas_engine_mission_assignment_guard before insert or update or delete
 on private.atlas_engine_mission_agents for each row execute function private.atlas_engine_mission_assignment_guard();
create trigger atlas_engine_mission_agent_primitive_guard before insert or update or delete
 on private.atlas_engine_mission_agent_primitives for each row execute function private.atlas_engine_mission_assignment_guard();

comment on table private.atlas_engine_mission_agents is
 'Proposed immutable mission→registered agent assignment. Service-role writer only; no runtime activation.';
comment on table private.atlas_engine_mission_agent_primitives is
 'Proposed per-assignment allowlist for two agent conversation primitives. Approval and execution gates remain separate.';
