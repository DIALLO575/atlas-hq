-- NON APPLIQUÉ. Destructive rollback: removes reading counters, sessions and retry receipts.
-- Execute only after explicit review/approval; old progress queues MUST be discarded.
BEGIN;
DROP FUNCTION public.journal_record_progress_batch(uuid,uuid,jsonb);
DROP TABLE public.journal_progress_batches;
DROP TABLE public.journal_reading_sessions;
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
