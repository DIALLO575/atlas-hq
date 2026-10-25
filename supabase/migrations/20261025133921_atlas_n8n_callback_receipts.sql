-- SHA-177: additive callback receipt/idempotency ledger for n8n automation METADATA.
-- No webhook endpoint, worker, provider connection, public RPC or change to
-- the SHA-176 hard offline release gate is created by this migration.
--
-- Existing Engine outbox receipts require an Engine run with mission; these
-- receipts reference autonomous n8n automation execution rows instead.
-- The FUTURE shared worker must atomically: verify HMAC + trusted binding,
-- insert a unique nonce receipt, lock the execution and CAS event_version.
--
-- Private schema is NOT exposed in PostgREST. Never store raw webhook bodies.
alter table public.atlas_automation_executions
 add column event_version bigint not null default 0
 check (event_version >= 0);

alter table public.atlas_automation_executions
 add constraint atlas_automation_execution_tenant_identity_unique
 unique (workspace_id, instance_id, id);

create table private.atlas_automation_callback_receipts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 instance_id uuid not null,
 execution_id uuid not null,
 nonce text not null check(nonce ~ '^[A-Za-z0-9_-]{24,96}$'),
 key_id text not null check(key_id ~ '^[a-z][a-z0-9_-]{0,31}$'),
 body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
 reported_status text not null
   check (reported_status in ('new','running','waiting','success','error','canceled')),
 event_at timestamptz not null,
 received_at timestamptz not null default now(),
 constraint atlas_automation_callback_receipts_execution_fk
   foreign key(workspace_id,instance_id,execution_id)
   references public.atlas_automation_executions(workspace_id,instance_id,id),
 constraint atlas_automation_callback_receipts_nonce_unique
   unique(workspace_id,instance_id,nonce)
);
create index atlas_automation_callback_receipts_exec_idx
 on private.atlas_automation_callback_receipts(
   workspace_id,instance_id,execution_id,received_at desc,id
 );
alter table private.atlas_automation_callback_receipts enable row level security;
revoke all on table private.atlas_automation_callback_receipts
 from public,anon,authenticated;
grant select,insert on table private.atlas_automation_callback_receipts to service_role;
-- No RLS policy: service_role bypasses RLS; no browser or member can query
-- callback receipts even with guessed execution ids. Future worker identity
-- requires least-privilege review before receiving any private DB grant.
comment on table private.atlas_automation_callback_receipts is
 'Immutable n8n signed callback METADATA/nonce receipts; no payload or replay handling activated. Private and service-role-only.';
