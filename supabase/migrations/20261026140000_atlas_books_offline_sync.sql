-- L3: persist device ordering and idempotency for offline progress/annotation replay.
BEGIN;
ALTER TABLE public.book_reading_state ADD COLUMN device_id uuid;
ALTER TABLE public.book_annotations ADD COLUMN send_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX book_annotations_user_send_id_idx ON public.book_annotations(user_id,send_id);

CREATE OR REPLACE FUNCTION public.book_record_progress_batch(p_workspace uuid,p_send_id uuid,p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid := (select auth.uid()); v_event jsonb; v_prior jsonb; v_rows integer; v_progress numeric; v_device uuid; v_threshold CONSTANT numeric := 0.98; v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF v_uid IS NULL OR p_workspace IS NULL OR p_send_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=v_uid AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid batch' USING ERRCODE='22023'; END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(v_event)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_event))<>6 OR NOT(v_event ?& ARRAY['bookId','deltaSeconds','position','clientUpdatedAt','pagesRead','deviceId']) OR jsonb_typeof(v_event->'bookId')<>'string' OR (v_event->>'bookId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(v_event->'deviceId')<>'string' OR (v_event->>'deviceId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(v_event->'deltaSeconds')<>'number' OR jsonb_typeof(v_event->'position')<>'number' OR jsonb_typeof(v_event->'clientUpdatedAt')<>'string' OR (v_event->'pagesRead'<>'null'::jsonb AND jsonb_typeof(v_event->'pagesRead')<>'number') THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
  IF (v_event->>'deltaSeconds')::numeric NOT BETWEEN 0 AND 120 OR trunc((v_event->>'deltaSeconds')::numeric)<>(v_event->>'deltaSeconds')::numeric OR (v_event->>'position')::numeric NOT BETWEEN 0 AND 1 OR ((v_event->>'pagesRead') IS NOT NULL AND ((v_event->>'pagesRead')::integer<0 OR trunc((v_event->>'pagesRead')::numeric)<>(v_event->>'pagesRead')::numeric)) THEN RAISE EXCEPTION 'invalid bounds' USING ERRCODE='22023'; END IF;
  PERFORM (v_event->>'clientUpdatedAt')::timestamptz;
  IF NOT EXISTS(SELECT 1 FROM public.books b WHERE b.id=(v_event->>'bookId')::uuid AND b.workspace_id=p_workspace AND b.owner_id=v_uid) THEN RAISE EXCEPTION 'unknown book' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'bookId') FROM jsonb_array_elements(p_events))<>jsonb_array_length(p_events) OR (SELECT sum((value->>'deltaSeconds')::integer) FROM jsonb_array_elements(p_events))>120 THEN RAISE EXCEPTION 'duplicate book or excessive delta' USING ERRCODE='22023'; END IF;
 INSERT INTO public.book_progress_batches(workspace_id,user_id,send_id,events) VALUES(p_workspace,v_uid,p_send_id,p_events) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN SELECT events INTO v_prior FROM public.book_progress_batches WHERE workspace_id=p_workspace AND user_id=v_uid AND send_id=p_send_id; IF v_prior IS DISTINCT FROM p_events THEN RAISE EXCEPTION 'send id reused' USING ERRCODE='22023'; END IF; RETURN jsonb_build_object('duplicate',true,'sendId',p_send_id); END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  v_progress := (v_event->>'position')::numeric; v_device := (v_event->>'deviceId')::uuid;
  INSERT INTO public.book_reading_state(workspace_id,book_id,user_id,position,pages_read,client_updated_at,finished_at,device_id) VALUES(p_workspace,(v_event->>'bookId')::uuid,v_uid,v_progress,NULLIF(v_event->>'pagesRead','null')::integer,(v_event->>'clientUpdatedAt')::timestamptz,CASE WHEN v_progress>=v_threshold THEN now() END,v_device)
  ON CONFLICT(workspace_id,book_id,user_id) DO UPDATE SET position=EXCLUDED.position,pages_read=EXCLUDED.pages_read,client_updated_at=EXCLUDED.client_updated_at,updated_at=now(),finished_at=CASE WHEN EXCLUDED.position>=v_threshold THEN coalesce(public.book_reading_state.finished_at,now()) ELSE NULL END,device_id=EXCLUDED.device_id
  WHERE (EXCLUDED.client_updated_at,EXCLUDED.device_id)>(public.book_reading_state.client_updated_at,coalesce(public.book_reading_state.device_id,'00000000-0000-0000-0000-000000000000'::uuid));
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO public.book_reading_sessions(workspace_id,book_id,user_id,day,seconds) VALUES(p_workspace,(v_event->>'bookId')::uuid,v_uid,v_day,(v_event->>'deltaSeconds')::integer) ON CONFLICT(workspace_id,book_id,user_id,day) DO UPDATE SET seconds=least(public.book_reading_sessions.seconds+EXCLUDED.seconds,86400),updated_at=now();
  IF v_rows>0 THEN UPDATE public.books SET status=CASE WHEN v_progress>=v_threshold THEN 'finished' ELSE status END,updated_at=now() WHERE id=(v_event->>'bookId')::uuid AND workspace_id=p_workspace; END IF;
 END LOOP;
 RETURN jsonb_build_object('duplicate',false,'sendId',p_send_id);
END $fn$;
COMMIT;
