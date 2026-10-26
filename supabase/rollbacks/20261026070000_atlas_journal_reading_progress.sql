-- NON APPLIQUÉ. DESTRUCTIVE AND IRREVERSIBLE: this rollback drops first_read_at,
-- seconds_read and last_position from feed_item_state, plus daily reading sessions
-- and the idempotency receipt ledger. Counters, daily totals and retry history are
-- permanently lost. Export/backup these rows before running this file; do not run
-- unless that data loss is explicitly accepted. Old queued progress batches MUST
-- also be discarded before rollback.
-- Suggested pre-rollback exports:
--   COPY (SELECT user_id,workspace_id,edition_id,item_id,first_read_at,seconds_read,last_position FROM public.feed_item_state WHERE seconds_read > 0 OR first_read_at IS NOT NULL OR last_position IS NOT NULL) TO STDOUT WITH CSV HEADER;
--   COPY (SELECT * FROM public.journal_reading_sessions) TO STDOUT WITH CSV HEADER;
--   COPY (SELECT user_id,workspace_id,batch_id,created_at FROM public.journal_progress_batches) TO STDOUT WITH CSV HEADER;
BEGIN;
DROP FUNCTION IF EXISTS public.journal_record_progress_batch(uuid,uuid,jsonb);
DROP TABLE IF EXISTS public.journal_progress_batches;
DROP TABLE IF EXISTS public.journal_reading_sessions;
ALTER TABLE public.feed_item_state DROP COLUMN last_position, DROP COLUMN seconds_read, DROP COLUMN first_read_at;
REVOKE INSERT(user_id,workspace_id,edition_id,item_id,status,updated_at), UPDATE(user_id,workspace_id,edition_id,item_id,status,updated_at) ON public.feed_item_state FROM authenticated;
GRANT INSERT, UPDATE ON public.feed_item_state TO authenticated;
DROP POLICY IF EXISTS feed_item_state_owner_select ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_select ON public.feed_item_state FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS feed_item_state_owner_insert ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_insert ON public.feed_item_state FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS feed_item_state_owner_update ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_update ON public.feed_item_state FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'))
  WITH CHECK (user_id = auth.uid());

COMMIT;
