-- SHA-132 follow-up: persist the encryption key identity per outbox message.
-- PREVIEW ONLY until disposable PostgreSQL CI and production preflight pass.
-- An old encrypted record has no reliable decryption key provenance; fail
-- instead of assigning a guessed key ID.
do $$
begin
  if exists (select 1 from private.atlas_engine_outbox limit 1) then
    raise exception 'ENGINE_OUTBOX_MUST_BE_EMPTY_FOR_V1_MIGRATION'
      using errcode = '23514';
  end if;
end $$;

alter table private.atlas_engine_outbox
  add column key_id text not null
    check (key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  add column version integer not null default 1
    check (version = 1);

comment on column private.atlas_engine_outbox.key_id is
  'Tenant-scoped AES-GCM key identifier supplied by trusted KMS-backed worker';
comment on column private.atlas_engine_outbox.version is
  'Version of authenticated encrypted envelope, currently AES-256-GCM v1';
