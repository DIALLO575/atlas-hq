-- SHA-132 preconnection proposal. NOT a Supabase migration; do not apply to production.
-- Promote via reviewed Supabase CLI migration after passing disposable PostgreSQL tests.
-- Prerequisites: workspaces, workspace_members, atlas_missions, private.is_workspace_*.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Authenticated users must resolve existing private.is_workspace_* RLS helpers.
grant usage on schema private to authenticated,service_role;

create table public.atlas_engine_instances (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 engine_key text not null check (engine_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
 label text not null check (length(btrim(label)) between 1 and 120),
 transport text not null default 'http' check (transport in ('http','mcp','cli','sse','companion')),
 connection_state text not null default 'offline' check (connection_state in ('offline','read-only','connected','suspended')),
 created_by uuid not null,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (workspace_id,created_by) references public.workspace_members(workspace_id,user_id),
 unique (workspace_id,id)
);
create index atlas_engine_instances_workspace_idx on public.atlas_engine_instances(workspace_id,created_at desc);
alter table public.atlas_engine_instances enable row level security;
revoke all on public.atlas_engine_instances from public, anon, authenticated;
grant select, insert on public.atlas_engine_instances to authenticated;
grant select, insert, update on public.atlas_engine_instances to service_role;
create policy atlas_engine_instances_read on public.atlas_engine_instances for select to authenticated
 using (private.is_workspace_member(workspace_id));
create policy atlas_engine_instances_register_offline on public.atlas_engine_instances for insert to authenticated
 with check (private.is_workspace_admin(workspace_id) and created_by=(select auth.uid())
 and connection_state='offline' and version=1);

create table public.atlas_engine_runs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 instance_id uuid not null, mission_id uuid not null, requested_by uuid not null,
 primitive_id text not null check (primitive_id ~ '^[a-z][a-z0-9._-]{1,119}$'),
 state text not null default 'draft' check (state in (
   'draft','awaiting-approval','authorized','leased','completed','failed','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id),
 foreign key (mission_id,workspace_id) references public.atlas_missions(id,workspace_id),
 foreign key (workspace_id,requested_by) references public.workspace_members(workspace_id,user_id),
 unique (workspace_id,id,instance_id)
);
create index atlas_engine_runs_workspace_idx on public.atlas_engine_runs(workspace_id,created_at desc);
alter table public.atlas_engine_runs enable row level security;
revoke all on public.atlas_engine_runs from public, anon, authenticated;
grant select on public.atlas_engine_runs to authenticated;
grant select, insert, update on public.atlas_engine_runs to service_role;
create policy atlas_engine_runs_visible on public.atlas_engine_runs for select to authenticated
 using (requested_by=(select auth.uid()) or private.is_workspace_admin(workspace_id));

create table private.atlas_engine_agent_bindings (
 workspace_id uuid not null, instance_id uuid not null,
 atlas_agent_key text not null check (atlas_agent_key ~ '^[A-Za-z0-9_-]{1,96}$'),
 remote_agent_key text check (remote_agent_key ~ '^[A-Za-z0-9_-]{1,120}$'),
 created_at timestamptz not null default now(),
 primary key (workspace_id,instance_id,atlas_agent_key),
 foreign key (workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id),
 unique (workspace_id,instance_id,remote_agent_key)
);
-- Ciphertext only. Encryption and key material reside in separately reviewed server vault.
create table private.atlas_engine_credentials (
 workspace_id uuid not null, instance_id uuid not null,
 key_id text not null check (key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
 nonce bytea not null check (octet_length(nonce)=12),
 ciphertext bytea not null check (octet_length(ciphertext) between 1 and 65536),
 tag bytea not null check (octet_length(tag)=16),
 version integer not null default 1 check (version>0), revoked_at timestamptz,
 primary key (workspace_id,instance_id),
 foreign key (workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id)
);
-- Human approval must originate from an actor session, not caller-provided approved:true.
create table private.atlas_engine_approvals (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,instance_id uuid not null,run_id uuid not null,
 requested_by uuid not null, decided_by uuid,
 decision text not null default 'pending' check(decision in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),decided_at timestamptz,expires_at timestamptz not null,
 foreign key (workspace_id,run_id,instance_id) references public.atlas_engine_runs(workspace_id,id,instance_id),
 foreign key (workspace_id,requested_by) references public.workspace_members(workspace_id,user_id),
 foreign key (workspace_id,decided_by) references public.workspace_members(workspace_id,user_id),
 check ((decision='pending' and decided_by is null and decided_at is null)
   or (decision <> 'pending' and decided_by is not null and decided_at is not null)),
 check (decided_by is null or decided_by<>requested_by),
 check (expires_at>created_at),
 unique(workspace_id,run_id)
);
-- Approval is created pending and can be decided once by a DIFFERENT human admin.
-- This is defense in depth; the API must still authenticate the actor session.
create function private.atlas_engine_approval_guard() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare original public.atlas_engine_runs%rowtype;
begin
 select * into original from public.atlas_engine_runs
 where id=new.run_id and workspace_id=new.workspace_id and instance_id=new.instance_id;
 if not found or new.requested_by<>original.requested_by then
   raise exception 'ENGINE_APPROVAL_REQUESTER_MISMATCH' using errcode='42501';
 end if;
 if tg_op='INSERT' then
   if new.decision<>'pending' then
     raise exception 'ENGINE_APPROVAL_MUST_START_PENDING' using errcode='42501';
   end if;
 elsif tg_op='UPDATE' then
   if old.decision<>'pending' or new.decision not in ('approved','rejected') or
      old.workspace_id<>new.workspace_id or old.run_id<>new.run_id or
      old.instance_id<>new.instance_id or old.requested_by<>new.requested_by or
      old.created_at<>new.created_at or old.expires_at<>new.expires_at then
     raise exception 'ENGINE_APPROVAL_IMMUTABLE' using errcode='42501';
   end if;
 end if;
 if new.decision in ('approved','rejected') then
   if new.expires_at<=now() or not exists (
     select 1 from public.workspace_members wm
      where wm.workspace_id=new.workspace_id
      and wm.user_id=new.decided_by and wm.role in ('owner','admin')
   ) or new.decided_by=original.requested_by then
     raise exception 'ENGINE_APPROVAL_REVIEWER_INVALID' using errcode='42501';
   end if;
 end if;
 return new;
end; $$;
revoke all on function private.atlas_engine_approval_guard() from public,anon,authenticated;
create trigger atlas_engine_approval_guard before insert or update on private.atlas_engine_approvals
 for each row execute function private.atlas_engine_approval_guard();

-- Idempotency key cannot be re-used within the same tenant and instance.
create table private.atlas_engine_outbox (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,instance_id uuid not null,run_id uuid not null,
 idempotency_key uuid not null,
 payload_nonce bytea not null check(octet_length(payload_nonce)=12),
 payload_ciphertext bytea not null check(octet_length(payload_ciphertext) between 1 and 1048576),
 payload_tag bytea not null check(octet_length(payload_tag)=16),
 state text not null default 'pending' check(state in ('pending','leased','delivered','retry','dead-letter')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 20),
 lease_until timestamptz,created_at timestamptz not null default now(),
 foreign key (workspace_id,run_id,instance_id) references public.atlas_engine_runs(workspace_id,id,instance_id),
 unique(workspace_id,instance_id,idempotency_key)
);
create index atlas_engine_outbox_due_idx on private.atlas_engine_outbox(state,created_at)
 where state in ('pending','retry');
-- Even service_role cannot lease without recorded approval and enabled connection.
create function private.atlas_engine_dispatch_guard() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.state in ('leased','delivered')
    and (tg_op='INSERT' or old.state is distinct from new.state) then
   if not exists (
      select 1 from public.atlas_engine_instances i
      join public.atlas_engine_runs r on r.workspace_id=i.workspace_id and r.instance_id=i.id
      join private.atlas_engine_approvals a on a.workspace_id=r.workspace_id
        and a.instance_id=r.instance_id and a.run_id=r.id
      where i.workspace_id=new.workspace_id and i.id=new.instance_id
        and r.id=new.run_id and i.connection_state='connected'
        and r.state in ('authorized','leased')
        and a.decision='approved' and a.expires_at>now()
   ) then raise exception 'ENGINE_DISPATCH_GATE_CLOSED' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.atlas_engine_dispatch_guard() from public,anon,authenticated;
create trigger atlas_engine_outbox_dispatch_guard before insert or update of state
 on private.atlas_engine_outbox for each row execute function private.atlas_engine_dispatch_guard();

create table private.atlas_engine_event_cursors (
 workspace_id uuid not null,instance_id uuid not null,
 stream_key text not null check(stream_key ~ '^[A-Za-z0-9_.-]{1,120}$'),
 cursor text not null check(length(cursor) between 1 and 300),
 revision bigint not null default 1 check(revision>0),
 primary key(workspace_id,instance_id,stream_key),
 foreign key(workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id)
);
create table private.atlas_engine_event_receipts (
 workspace_id uuid not null,instance_id uuid not null,event_id text not null
   check(length(event_id) between 1 and 300),
 received_at timestamptz not null default now(),
 primary key(workspace_id,instance_id,event_id),
 foreign key(workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id)
);
-- Never logs plaintext, prompt, tool args or passwords.
create table private.atlas_engine_audit_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,instance_id uuid not null,
 run_id uuid,actor_id uuid,
 event_key text not null check(event_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
 payload_digest text check(payload_digest ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz not null default now(),
 foreign key(workspace_id,instance_id) references public.atlas_engine_instances(workspace_id,id),
 foreign key(workspace_id,run_id,instance_id) references public.atlas_engine_runs(workspace_id,id,instance_id),
 foreign key(workspace_id,actor_id) references public.workspace_members(workspace_id,user_id)
);
create function private.atlas_engine_audit_immutable() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin raise exception 'ENGINE_AUDIT_IMMUTABLE' using errcode='42501';end;$$;
revoke all on function private.atlas_engine_audit_immutable() from public,anon,authenticated;
create trigger atlas_engine_audit_immutable before update or delete
 on private.atlas_engine_audit_events for each row execute function private.atlas_engine_audit_immutable();

do $$ declare tbl text;begin
 foreach tbl in array array['atlas_engine_agent_bindings','atlas_engine_credentials',
 'atlas_engine_approvals','atlas_engine_outbox','atlas_engine_event_cursors',
 'atlas_engine_event_receipts','atlas_engine_audit_events'] loop
   execute format('alter table private.%I enable row level security',tbl);
   execute format('revoke all on private.%I from public,anon,authenticated',tbl);
   execute format('grant select,insert,update on private.%I to service_role',tbl);
 end loop;
end $$;
revoke update on private.atlas_engine_audit_events from service_role;
-- The private schema has no RLS policies for authenticated users.
