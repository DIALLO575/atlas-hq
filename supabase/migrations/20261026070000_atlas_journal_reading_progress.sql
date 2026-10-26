-- PROPOSED / NON APPLIQUÉE. SHADORON only after review + Paul approval.
-- No content, URL, IP or user-agent. Receipt payload contains only opaque ids/deltas/position.
BEGIN;
ALTER TABLE public.feed_item_state
 ADD COLUMN IF NOT EXISTS first_read_at timestamptz,
 ADD COLUMN IF NOT EXISTS seconds_read integer NOT NULL DEFAULT 0 CHECK (seconds_read BETWEEN 0 AND 86400),
 ADD COLUMN IF NOT EXISTS last_position numeric CHECK (last_position BETWEEN 0 AND 1);

CREATE TABLE IF NOT EXISTS public.journal_reading_sessions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 edition_id text NOT NULL CHECK (edition_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
 item_id text NOT NULL CHECK (item_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
 day date NOT NULL,
 seconds integer NOT NULL CHECK (seconds BETWEEN 0 AND 86400),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,workspace_id,edition_id,item_id,day)
);
CREATE INDEX IF NOT EXISTS journal_reading_sessions_day_idx ON public.journal_reading_sessions(user_id,workspace_id,day);
CREATE TABLE IF NOT EXISTS public.journal_progress_batches (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL,
 events jsonb NOT NULL CHECK (jsonb_typeof(events) = 'array' AND jsonb_array_length(events) BETWEEN 1 AND 20),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,workspace_id,batch_id)
);
ALTER TABLE public.journal_reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_progress_batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS journal_progress_batches_created_at_idx ON public.journal_progress_batches(created_at);
REVOKE ALL ON public.journal_reading_sessions, public.journal_progress_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journal_reading_sessions TO authenticated;
-- Receipts have no client grants/policies: internal RPC-only ledger, retained for 90 days.
DROP POLICY IF EXISTS journal_reading_sessions_owner_select ON public.journal_reading_sessions;
CREATE POLICY journal_reading_sessions_owner_select ON public.journal_reading_sessions FOR SELECT TO authenticated
 USING (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.workspace_members m
 WHERE m.workspace_id = journal_reading_sessions.workspace_id AND m.user_id = (select auth.uid()) AND m.role = 'owner'));

-- Preserve existing status upsert API; progress columns are not client-writable.
REVOKE INSERT, UPDATE ON public.feed_item_state FROM authenticated;
GRANT INSERT(user_id,workspace_id,edition_id,item_id,status,updated_at),
 UPDATE(user_id,workspace_id,edition_id,item_id,status,updated_at) ON public.feed_item_state TO authenticated;
DROP POLICY feed_item_state_owner_select ON public.feed_item_state;
DROP POLICY feed_item_state_owner_insert ON public.feed_item_state;
DROP POLICY feed_item_state_owner_update ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_select ON public.feed_item_state FOR SELECT TO authenticated
 USING(user_id = (select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=feed_item_state.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
CREATE POLICY feed_item_state_owner_insert ON public.feed_item_state FOR INSERT TO authenticated
 WITH CHECK(user_id = (select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=feed_item_state.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
CREATE POLICY feed_item_state_owner_update ON public.feed_item_state FOR UPDATE TO authenticated
 USING(user_id = (select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=feed_item_state.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'))
 WITH CHECK(user_id = (select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=feed_item_state.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));

-- SECURITY DEFINER intentionally encapsulates counters + private dedupe ledger;
-- explicit auth + owner checks below replace bypassed RLS. No caller-supplied user_id.
CREATE OR REPLACE FUNCTION public.journal_record_progress_batch(p_workspace uuid, p_batch uuid, p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v_uid uuid := (select auth.uid()); v_event jsonb; v_events jsonb; v_prior jsonb;
 v_inserted integer; v_before integer; v_delta integer; v_total integer := 0;
 v_day date := (now() AT TIME ZONE 'UTC')::date;
 v_read_threshold_seconds CONSTANT integer := 30;
 v_receipt_retention CONSTANT interval := interval '90 days';
BEGIN
 IF v_uid IS NULL OR p_workspace IS NULL OR p_batch IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 -- Locks membership against concurrent role revocation for this transaction.
 PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=v_uid AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' THEN RAISE EXCEPTION 'invalid batch' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid batch size' USING ERRCODE='22023'; END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(v_event)<>'object' THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_event))<>4 OR NOT (v_event ?& ARRAY['editionId','itemId','deltaSeconds','position'])
    OR jsonb_typeof(v_event->'editionId')<>'string' OR jsonb_typeof(v_event->'itemId')<>'string'
    OR (v_event->>'editionId') !~ '^[A-Za-z0-9._:-]{1,120}$' OR (v_event->>'itemId') !~ '^[A-Za-z0-9._:-]{1,120}$'
    OR jsonb_typeof(v_event->'deltaSeconds')<>'number' OR jsonb_typeof(v_event->'position')<>'number' THEN
    RAISE EXCEPTION 'invalid fields' USING ERRCODE='22023'; END IF;
  IF (v_event->>'deltaSeconds')::numeric NOT BETWEEN 0 AND 120
    OR trunc((v_event->>'deltaSeconds')::numeric)<>(v_event->>'deltaSeconds')::numeric
    OR (v_event->>'position')::numeric NOT BETWEEN 0 AND 1
    OR round((v_event->>'position')::numeric,2)<>(v_event->>'position')::numeric THEN
    RAISE EXCEPTION 'invalid bounds' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journal_items i WHERE i.workspace_id=p_workspace
    AND i.edition_id=v_event->>'editionId' AND i.item_id=v_event->>'itemId') THEN
    RAISE EXCEPTION 'unknown workspace item' USING ERRCODE='22023'; END IF;
  v_total := v_total + (v_event->>'deltaSeconds')::integer;
 END LOOP;
 IF v_total>120 OR (SELECT count(*) FROM (SELECT DISTINCT value->>'editionId',value->>'itemId' FROM jsonb_array_elements(p_events)) s)<>jsonb_array_length(p_events) THEN
  RAISE EXCEPTION 'invalid totals or duplicate item' USING ERRCODE='22023'; END IF;
 -- Canonical order also prevents deadlocks for overlapping multi-item batches.
 SELECT jsonb_agg(value ORDER BY value->>'editionId' COLLATE "C", value->>'itemId' COLLATE "C") INTO v_events FROM jsonb_array_elements(p_events);
 -- Bound the idempotency ledger; retries remain protected for 90 days.
 DELETE FROM public.journal_progress_batches WHERE created_at < now() - v_receipt_retention;
 INSERT INTO public.journal_progress_batches(user_id,workspace_id,batch_id,events) VALUES(v_uid,p_workspace,p_batch,v_events)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_inserted = ROW_COUNT;
 IF v_inserted=0 THEN
  SELECT events INTO v_prior FROM public.journal_progress_batches WHERE user_id=v_uid AND workspace_id=p_workspace AND batch_id=p_batch;
  IF v_prior IS DISTINCT FROM v_events THEN RAISE EXCEPTION 'batch id reused' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('duplicate',true,'batchId',p_batch);
 END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(v_events) LOOP
  INSERT INTO public.feed_item_state(user_id,workspace_id,edition_id,item_id,status)
   VALUES(v_uid,p_workspace,v_event->>'editionId',v_event->>'itemId','read') ON CONFLICT DO NOTHING;
  SELECT seconds_read INTO v_before FROM public.feed_item_state
   WHERE user_id=v_uid AND workspace_id=p_workspace AND edition_id=v_event->>'editionId' AND item_id=v_event->>'itemId' FOR UPDATE;
  v_delta := least((v_event->>'deltaSeconds')::integer,86400-v_before);
  UPDATE public.feed_item_state SET status=CASE WHEN status='new' AND v_before+v_delta >= v_read_threshold_seconds THEN 'read' ELSE status END,
   first_read_at=coalesce(first_read_at,CASE WHEN v_before+v_delta >= v_read_threshold_seconds THEN now() END),
   seconds_read=seconds_read+v_delta,last_position=(v_event->>'position')::numeric,updated_at=now()
   WHERE user_id=v_uid AND workspace_id=p_workspace AND edition_id=v_event->>'editionId' AND item_id=v_event->>'itemId';
  INSERT INTO public.journal_reading_sessions(user_id,workspace_id,edition_id,item_id,day,seconds)
   VALUES(v_uid,p_workspace,v_event->>'editionId',v_event->>'itemId',v_day,v_delta)
   ON CONFLICT(user_id,workspace_id,edition_id,item_id,day) DO UPDATE
   SET seconds=least(public.journal_reading_sessions.seconds+excluded.seconds,86400),updated_at=now();
 END LOOP;
 RETURN jsonb_build_object('duplicate',false,'batchId',p_batch);
END $function$;
REVOKE ALL ON FUNCTION public.journal_record_progress_batch(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_record_progress_batch(uuid,uuid,jsonb) TO authenticated;
COMMIT;
