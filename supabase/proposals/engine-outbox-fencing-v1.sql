-- SHA-151 preconnection: durable SQL lease fencing for a future PRIVATE worker.
-- No public RPC, no credential decrypt, no connector and no MAUSBOT I/O.
-- Apply only after disposal-PG CI and production preflight with no active leases.
do $$
begin
 if exists (select 1 from private.atlas_engine_outbox where state='leased') then
   raise exception 'ENGINE_OUTBOX_ACTIVE_LEASE_MIGRATION_BLOCKED'
     using errcode='23514';
 end if;
end $$;

alter table private.atlas_engine_outbox
 add column lease_token uuid,
 add column lease_epoch bigint not null default 0 check(lease_epoch>=0),
 add column lease_owner text check(lease_owner ~ '^[A-Za-z0-9._-]{1,80}$'),
 add column next_attempt_at timestamptz not null default now(),
 add column last_error_code text check(last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
 add constraint atlas_engine_lease_consistency check(
   (state='leased' and lease_token is not null and lease_owner is not null
      and lease_until is not null and lease_epoch>0)
   or
   (state<>'leased' and lease_token is null and lease_owner is null
      and lease_until is null)
 );
create index atlas_engine_outbox_claim_due_idx on private.atlas_engine_outbox
 (workspace_id,next_attempt_at,created_at)
 where state in ('pending','retry','leased');

-- DB is the final arbiter: encrypted payload must never be returned by claim.
-- All operations use SECURITY INVOKER, private-schema functions, only
-- service_role granted EXECUTE. They cannot be called from PostgREST.
create function private.atlas_engine_worker_claim(
 p_workspace_id uuid,p_worker_id text,p_lease_seconds integer default 60)
returns table(outbox_id uuid,instance_id uuid,run_id uuid,
 lease_token uuid,lease_epoch bigint,lease_until timestamptz)
language plpgsql volatile security invoker set search_path='' as $$
declare
 v_outbox uuid; v_run uuid; v_instance uuid; v_epoch bigint;
 v_token uuid; v_until timestamptz;
begin
 if p_workspace_id is null or p_worker_id is null
    or p_worker_id !~ '^[A-Za-z0-9._-]{1,80}$'
    or p_lease_seconds not between 15 and 120 then
   raise exception 'ENGINE_WORKER_INPUT_INVALID' using errcode='22023';
 end if;

 select o.id,o.instance_id,o.run_id
 into v_outbox,v_instance,v_run
 from private.atlas_engine_outbox o
 join public.atlas_engine_runs r on r.workspace_id=o.workspace_id
   and r.instance_id=o.instance_id and r.id=o.run_id
 join public.atlas_engine_instances i on i.workspace_id=o.workspace_id
   and i.id=o.instance_id
 join private.atlas_engine_approvals a on a.workspace_id=o.workspace_id
   and a.instance_id=o.instance_id and a.run_id=o.run_id
 where o.workspace_id=p_workspace_id
   and o.attempt_count<5
   and (
      (o.state in ('pending','retry') and o.next_attempt_at<=clock_timestamp())
      or (o.state='leased' and o.lease_until<=clock_timestamp())
   )
   and i.connection_state='connected' and r.state='authorized'
   and a.decision='approved' and a.expires_at>clock_timestamp()
 order by o.next_attempt_at,o.created_at,o.id
 for update of o skip locked limit 1;
 if v_outbox is null then return;end if;

 v_token:=gen_random_uuid();
 v_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
 update private.atlas_engine_outbox o
   set state='leased',lease_token=v_token,lease_owner=p_worker_id,
       lease_epoch=o.lease_epoch+1,attempt_count=o.attempt_count+1,
       lease_until=v_until,last_error_code=null
 where o.id=v_outbox and o.workspace_id=p_workspace_id
 returning o.lease_epoch into v_epoch;
 if not found then raise exception 'ENGINE_WORKER_CLAIM_RACE'
   using errcode='40001';end if;

 insert into private.atlas_engine_audit_events(
  workspace_id,instance_id,run_id,event_key)
 values(p_workspace_id,v_instance,v_run,'engine.outbox.leased');
 return query select v_outbox,v_instance,v_run,v_token,v_epoch,v_until;
end $$;
revoke all on function private.atlas_engine_worker_claim(uuid,text,integer)
 from public,anon,authenticated;
grant execute on function private.atlas_engine_worker_claim(uuid,text,integer)
 to service_role;

-- The token + increasing epoch are BOTH required (fencing). No caller can
-- heartbeat a lease owned by a newer worker. No ciphertext is returned.
create function private.atlas_engine_worker_heartbeat(
 p_workspace_id uuid,p_outbox_id uuid,p_worker_id text,
 p_lease_token uuid,p_lease_epoch bigint,p_lease_seconds integer default 60)
returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare v_new_until timestamptz;
begin
 if p_workspace_id is null or p_outbox_id is null or p_lease_token is null
  or p_lease_epoch is null or p_lease_epoch<=0
  or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._-]{1,80}$'
  or p_lease_seconds not between 15 and 120 then
    raise exception 'ENGINE_WORKER_INPUT_INVALID' using errcode='22023';
 end if;
 v_new_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
 update private.atlas_engine_outbox o
   set lease_until=v_new_until
 from public.atlas_engine_runs r,public.atlas_engine_instances i,
      private.atlas_engine_approvals a
 where o.id=p_outbox_id and o.workspace_id=p_workspace_id
   and o.lease_token=p_lease_token and o.lease_epoch=p_lease_epoch
   and o.lease_owner=p_worker_id and o.state='leased'
   and o.lease_until>clock_timestamp()
   and r.id=o.run_id and r.workspace_id=o.workspace_id and r.instance_id=o.instance_id
   and r.state='authorized'
   and i.id=o.instance_id and i.workspace_id=o.workspace_id and i.connection_state='connected'
   and a.run_id=o.run_id and a.workspace_id=o.workspace_id
   and a.instance_id=o.instance_id and a.decision='approved'
   and a.expires_at>clock_timestamp();
 return found;
end $$;
revoke all on function private.atlas_engine_worker_heartbeat(
 uuid,uuid,text,uuid,bigint,integer) from public,anon,authenticated;
grant execute on function private.atlas_engine_worker_heartbeat(
 uuid,uuid,text,uuid,bigint,integer) to service_role;

create function private.atlas_engine_worker_finish(
 p_workspace_id uuid,p_outbox_id uuid,p_worker_id text,
 p_lease_token uuid,p_lease_epoch bigint,p_success boolean,p_error_code text default null)
returns text
language plpgsql volatile security invoker set search_path='' as $$
declare
 v_row record; v_state text; v_audit text;
begin
 if p_workspace_id is null or p_outbox_id is null or p_lease_token is null
   or p_lease_epoch is null or p_lease_epoch<=0 or p_success is null
   or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._-]{1,80}$'
   or (p_success and p_error_code is not null)
   or (not p_success and (p_error_code is null or
       p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$')) then
   raise exception 'ENGINE_WORKER_INPUT_INVALID' using errcode='22023';
 end if;
 select o.id,o.instance_id,o.run_id,o.attempt_count
 into v_row
 from private.atlas_engine_outbox o
 where o.id=p_outbox_id and o.workspace_id=p_workspace_id
   and o.state='leased' and o.lease_owner=p_worker_id
   and o.lease_token=p_lease_token and o.lease_epoch=p_lease_epoch
   and o.lease_until>clock_timestamp()
 for update;
 if not found then
   raise exception 'ENGINE_WORKER_STALE_LEASE' using errcode='42501';
 end if;
 v_state:=case when p_success then 'delivered'
       when v_row.attempt_count>=5 then 'dead-letter' else 'retry' end;
 v_audit:=case v_state when 'delivered' then 'engine.outbox.delivered'
              when 'retry' then 'engine.outbox.retry'
              else 'engine.outbox.dead-letter' end;
 update private.atlas_engine_outbox o
   set state=v_state,lease_owner=null,lease_token=null,lease_until=null,
      last_error_code=case when p_success then null else p_error_code end,
      next_attempt_at=case when p_success then o.next_attempt_at
        else clock_timestamp()+make_interval(secs=>
          least(300,(power(2,least(o.attempt_count,7))::integer)*5)) end
 where o.id=v_row.id;
 insert into private.atlas_engine_audit_events(workspace_id,instance_id,run_id,event_key)
 values(p_workspace_id,v_row.instance_id,v_row.run_id,v_audit);
 return v_state;
end $$;
revoke all on function private.atlas_engine_worker_finish(
 uuid,uuid,text,uuid,bigint,boolean,text) from public,anon,authenticated;
grant execute on function private.atlas_engine_worker_finish(
 uuid,uuid,text,uuid,bigint,boolean,text) to service_role;

-- A crash on attempt 5 must not strand a permanently expired leased row.
-- A bounded worker-only sweeper transitions exhausted leases to dead-letter,
-- including when an instance is subsequently disabled; no payload is read.
create function private.atlas_engine_worker_reap_exhausted(
 p_workspace_id uuid,p_limit integer default 25)
returns integer
language plpgsql volatile security invoker set search_path='' as $
declare v record; v_count integer:=0;
begin
 if p_workspace_id is null or p_limit not between 1 and 100 then
   raise exception 'ENGINE_WORKER_INPUT_INVALID' using errcode='22023';
 end if;
 for v in
  select o.id,o.instance_id,o.run_id
  from private.atlas_engine_outbox o
  where o.workspace_id=p_workspace_id and o.state='leased'
     and o.attempt_count>=5 and o.lease_until<=clock_timestamp()
  order by o.created_at,o.id
  for update skip locked limit p_limit
 loop
  update private.atlas_engine_outbox set state='dead-letter',
    lease_token=null,lease_owner=null,lease_until=null,
    last_error_code='MAX_ATTEMPTS'
  where id=v.id and workspace_id=p_workspace_id;
  insert into private.atlas_engine_audit_events(
    workspace_id,instance_id,run_id,event_key)
  values(p_workspace_id,v.instance_id,v.run_id,'engine.outbox.dead-letter');
  v_count:=v_count+1;
 end loop;
 return v_count;
end $;
revoke all on function private.atlas_engine_worker_reap_exhausted(uuid,integer)
 from public,anon,authenticated;
grant execute on function private.atlas_engine_worker_reap_exhausted(uuid,integer)
 to service_role;

-- This migration does not install pg_cron, an HTTP worker or a MAUSBOT connection.
