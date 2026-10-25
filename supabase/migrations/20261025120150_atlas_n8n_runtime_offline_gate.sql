-- SHA-176: defensive, additive, FAIL-CLOSED n8n runtime gate.
-- No production n8n connection is authorized. Releasing the engine requires
-- a separately reviewed forward migration AFTER Auth+approvals+worker+egress.
-- Other engine keys and existing MAUSBOT release gates are unaffected.
alter table public.atlas_engine_instances
 add constraint atlas_n8n_runtime_offline_only
 check (engine_key <> 'n8n' or connection_state='offline');

comment on constraint atlas_n8n_runtime_offline_only on public.atlas_engine_instances is
 'n8n must remain OFFLINE even to service_role until explicit future release DDL after sandbox certification';
