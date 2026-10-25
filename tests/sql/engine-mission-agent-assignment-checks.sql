-- Disposable PG17 proposal checks only. Never run on connected Supabase.
\set ON_ERROR_STOP on
set role service_role;
insert into private.atlas_engine_agent_bindings(workspace_id,instance_id,atlas_agent_key,remote_agent_key)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','vision','remote-vision-v1'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000002','vision','remote-vision-other');
create temp table assignment_baseline as select count(*) n from private.atlas_engine_audit_events where event_key like 'engine.mission_agent.%';
insert into private.atlas_engine_mission_agents(id,workspace_id,mission_id,instance_id,atlas_agent_key,remote_agent_key,assigned_by)
values('abababab-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001','vision','remote-vision-v1',
 '11111111-1111-4111-8111-111111111111');
insert into private.atlas_engine_mission_agent_primitives(id,workspace_id,mission_agent_id,primitive_id,granted_by)
values('abababab-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-0000-4000-8000-000000000001','conversations.messages.send','11111111-1111-4111-8111-111111111111');
do $$ begin
 if (select count(*) from private.atlas_engine_audit_events where event_key='engine.mission_agent.assigned')<>1
  or (select count(*) from private.atlas_engine_audit_events where event_key='engine.mission_agent.primitive.granted')<>1 then raise exception 'ASSIGNMENT_AUDIT_MISSING';end if;
 begin
  insert into private.atlas_engine_mission_agents(workspace_id,mission_id,instance_id,atlas_agent_key,remote_agent_key,assigned_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001','vision','remote-vision-v1','11111111-1111-4111-8111-111111111111');
  raise exception 'DUPLICATE_ACTIVE_ASSIGNMENT_ACCEPTED';
 exception when unique_violation then null;end;
 begin
  insert into private.atlas_engine_mission_agents(workspace_id,mission_id,instance_id,atlas_agent_key,remote_agent_key,assigned_by,revoked_at,revoked_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001','pre-revoked','remote-pre-revoked','11111111-1111-4111-8111-111111111111',clock_timestamp(),'11111111-1111-4111-8111-111111111111');
  raise exception 'PRE_REVOKED_ASSIGNMENT_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  insert into private.atlas_engine_mission_agent_primitives(workspace_id,mission_agent_id,primitive_id,granted_by,revoked_at,revoked_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-0000-4000-8000-000000000001','conversations.messages.list','11111111-1111-4111-8111-111111111111',clock_timestamp(),'11111111-1111-4111-8111-111111111111');
  raise exception 'PRE_REVOKED_PRIMITIVE_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  insert into private.atlas_engine_mission_agents(workspace_id,mission_id,instance_id,atlas_agent_key,remote_agent_key,assigned_by)
  values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff','aaaaaaaa-0000-4000-8000-000000000001','vision','remote-vision-v1','22222222-2222-4222-8222-222222222222');
  raise exception 'CROSS_TENANT_ASSIGNMENT_ACCEPTED';
 exception when foreign_key_violation then null;end;
 begin
  update private.atlas_engine_mission_agents set remote_agent_key='forged';
  raise exception 'ASSIGNMENT_IDENTITY_MUTATED';
 exception when insufficient_privilege then null;end;
 begin
  delete from private.atlas_engine_mission_agents where id='abababab-0000-4000-8000-000000000001';
  raise exception 'ASSIGNMENT_DELETED';
 exception when insufficient_privilege then null;end;
 begin
  insert into private.atlas_engine_mission_agent_primitives(workspace_id,mission_agent_id,primitive_id,granted_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-0000-4000-8000-000000000001','channels.messages.send','11111111-1111-4111-8111-111111111111');
  raise exception 'UNSUPPORTED_PRIMITIVE_GRANT_ACCEPTED';
 exception when check_violation then null;end;
end $$;
update private.atlas_engine_mission_agent_primitives set revoked_at=clock_timestamp(),revoked_by='11111111-1111-4111-8111-111111111111'
 where id='abababab-0000-4000-8000-000000000002';
insert into private.atlas_engine_mission_agent_primitives(workspace_id,mission_agent_id,primitive_id,granted_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-0000-4000-8000-000000000001','conversations.messages.send','11111111-1111-4111-8111-111111111111');
update private.atlas_engine_mission_agents set revoked_at=clock_timestamp(),revoked_by='11111111-1111-4111-8111-111111111111'
 where id='abababab-0000-4000-8000-000000000001';
insert into private.atlas_engine_mission_agents(workspace_id,mission_id,instance_id,atlas_agent_key,remote_agent_key,assigned_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'aaaaaaaa-0000-4000-8000-000000000001','vision','remote-vision-v1','11111111-1111-4111-8111-111111111111');
do $$ begin
 if (select count(*) from private.atlas_engine_audit_events where event_key like 'engine.mission_agent.%') - (select n from assignment_baseline)<>6 then raise exception 'BINDING_HISTORY_AUDIT_MISSING';end if;
 if has_table_privilege('anon','private.atlas_engine_mission_agents','SELECT') or has_table_privilege('authenticated','private.atlas_engine_mission_agent_primitives','SELECT') then raise exception 'CLIENT_CAN_READ_PRIVATE_ASSIGNMENTS';end if;
 if not has_table_privilege('service_role','private.atlas_engine_mission_agents','SELECT') then raise exception 'WORKER_CANNOT_READ_ASSIGNMENTS';end if;
 if to_regclass('private.atlas_engine_mission_agents_mission_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agents_binding_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agents_assigned_member_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agents_assigned_user_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agents_revoked_member_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agents_revoked_user_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agent_primitives_assignment_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agent_primitives_granted_member_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agent_primitives_granted_user_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agent_primitives_revoked_member_fk_idx') is null
  or to_regclass('private.atlas_engine_mission_agent_primitives_revoked_user_fk_idx') is null then
  raise exception 'ASSIGNMENT_FOREIGN_KEY_INDEX_MISSING'; end if;
end $$;
reset role;
