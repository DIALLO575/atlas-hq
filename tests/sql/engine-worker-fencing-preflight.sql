-- Disposable-only preflight resets the artificial leased fixture created by
-- the earlier authorization guard test. NEVER use against connected Supabase.
update private.atlas_engine_outbox
 set state='dead-letter',lease_until=null
 where id='ddddddd1-0000-4000-8000-000000000001';
