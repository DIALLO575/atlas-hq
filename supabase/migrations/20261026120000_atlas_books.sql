-- L1: additive private book library schema. Proposed only; do not apply outside review.
BEGIN;
CREATE TABLE public.books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
 author text NOT NULL DEFAULT '' CHECK(length(author) <= 300), format text NOT NULL CHECK(format IN ('epub','pdf')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
CREATE TABLE public.book_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, book_id uuid NOT NULL,
 storage_path text NOT NULL UNIQUE, mime_type text NOT NULL CHECK(mime_type IN ('application/epub+zip','application/pdf')),
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600), checksum_sha256 text CHECK(checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,book_id) REFERENCES public.books(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE public.book_reading_state (
 workspace_id uuid NOT NULL, book_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 position numeric NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1), pages_read integer CHECK(pages_read IS NULL OR pages_read >= 0),
 client_updated_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 PRIMARY KEY(workspace_id,book_id,user_id),
 FOREIGN KEY(workspace_id,book_id) REFERENCES public.books(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE public.book_reading_sessions (
 workspace_id uuid NOT NULL, book_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day date NOT NULL, seconds integer NOT NULL CHECK(seconds BETWEEN 0 AND 86400), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,book_id,user_id,day),
 FOREIGN KEY(workspace_id,book_id) REFERENCES public.books(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE public.book_progress_batches (
 workspace_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, send_id uuid NOT NULL,
 events jsonb NOT NULL CHECK(jsonb_typeof(events)='array' AND jsonb_array_length(events) BETWEEN 1 AND 20), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,send_id)
);
CREATE TABLE public.book_annotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, book_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('note','highlight')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 10000), position numeric NOT NULL CHECK(position BETWEEN 0 AND 1),
 color text NOT NULL DEFAULT 'yellow' CHECK(color IN ('yellow','blue','green','pink')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,book_id) REFERENCES public.books(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE public.book_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id)
);
CREATE TABLE public.book_collection_items (
 workspace_id uuid NOT NULL, collection_id uuid NOT NULL, book_id uuid NOT NULL,
 added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,collection_id,book_id),
 FOREIGN KEY(workspace_id,collection_id) REFERENCES public.book_collections(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,book_id) REFERENCES public.books(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX books_owner_updated_idx ON public.books(workspace_id,owner_id,updated_at DESC);
CREATE INDEX book_annotations_book_idx ON public.book_annotations(workspace_id,book_id,updated_at DESC);
CREATE INDEX book_sessions_day_idx ON public.book_reading_sessions(workspace_id,user_id,day DESC);
CREATE INDEX book_batches_created_idx ON public.book_progress_batches(created_at);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['books','book_files','book_reading_state','book_reading_sessions','book_progress_batches','book_annotations','book_collections','book_collection_items'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
 END LOOP;
END $$;
-- Progress is writable only through the validating SECURITY DEFINER RPC.
REVOKE INSERT, UPDATE, DELETE ON public.book_reading_state, public.book_reading_sessions, public.book_progress_batches FROM authenticated;
GRANT SELECT ON public.book_reading_state, public.book_reading_sessions TO authenticated;
REVOKE ALL ON public.book_progress_batches FROM authenticated;
CREATE POLICY books_owner_all ON public.books FOR ALL TO authenticated
 USING(owner_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=books.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'))
 WITH CHECK(owner_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=books.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
CREATE POLICY book_files_owner_all ON public.book_files FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_files.book_id AND b.workspace_id=book_files.workspace_id AND b.owner_id=(select auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_files.book_id AND b.workspace_id=book_files.workspace_id AND b.owner_id=(select auth.uid())));
CREATE POLICY book_state_owner_all ON public.book_reading_state FOR ALL TO authenticated USING(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_reading_state.book_id AND b.workspace_id=book_reading_state.workspace_id AND b.owner_id=(select auth.uid()))) WITH CHECK(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_reading_state.book_id AND b.workspace_id=book_reading_state.workspace_id AND b.owner_id=(select auth.uid())));
CREATE POLICY book_sessions_owner_all ON public.book_reading_sessions FOR ALL TO authenticated USING(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_reading_sessions.book_id AND b.workspace_id=book_reading_sessions.workspace_id AND b.owner_id=(select auth.uid()))) WITH CHECK(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_reading_sessions.book_id AND b.workspace_id=book_reading_sessions.workspace_id AND b.owner_id=(select auth.uid())));
CREATE POLICY book_batches_owner_all ON public.book_progress_batches FOR ALL TO authenticated USING(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_progress_batches.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner')) WITH CHECK(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_progress_batches.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
CREATE POLICY book_annotations_owner_all ON public.book_annotations FOR ALL TO authenticated USING(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_annotations.book_id AND b.workspace_id=book_annotations.workspace_id AND b.owner_id=(select auth.uid()))) WITH CHECK(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_annotations.book_id AND b.workspace_id=book_annotations.workspace_id AND b.owner_id=(select auth.uid())));
CREATE POLICY book_collections_owner_all ON public.book_collections FOR ALL TO authenticated USING(owner_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_collections.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner')) WITH CHECK(owner_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_collections.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
CREATE POLICY book_collection_items_owner_all ON public.book_collection_items FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.book_collections c WHERE c.id=book_collection_items.collection_id AND c.workspace_id=book_collection_items.workspace_id AND c.owner_id=(select auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.book_collections c WHERE c.id=book_collection_items.collection_id AND c.workspace_id=book_collection_items.workspace_id AND c.owner_id=(select auth.uid())));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('books','books',false,104857600,ARRAY['application/epub+zip','application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=104857600,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY books_storage_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='books' AND EXISTS(SELECT 1 FROM public.books b WHERE b.workspace_id::text=(storage.foldername(name))[1] AND b.id::text=(storage.foldername(name))[2] AND b.owner_id=(select auth.uid())));
CREATE POLICY books_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='books' AND EXISTS(SELECT 1 FROM public.books b WHERE b.workspace_id::text=(storage.foldername(name))[1] AND b.id::text=(storage.foldername(name))[2] AND b.owner_id=(select auth.uid())));
CREATE POLICY books_storage_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='books' AND EXISTS(SELECT 1 FROM public.books b WHERE b.workspace_id::text=(storage.foldername(name))[1] AND b.id::text=(storage.foldername(name))[2] AND b.owner_id=(select auth.uid()))) WITH CHECK(bucket_id='books' AND EXISTS(SELECT 1 FROM public.books b WHERE b.workspace_id::text=(storage.foldername(name))[1] AND b.id::text=(storage.foldername(name))[2] AND b.owner_id=(select auth.uid())));
CREATE POLICY books_storage_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='books' AND EXISTS(SELECT 1 FROM public.books b WHERE b.workspace_id::text=(storage.foldername(name))[1] AND b.id::text=(storage.foldername(name))[2] AND b.owner_id=(select auth.uid())));
CREATE OR REPLACE FUNCTION public.book_record_progress_batch(p_workspace uuid,p_send_id uuid,p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid := (select auth.uid()); v_event jsonb; v_prior jsonb; v_rows integer; v_progress numeric; v_client_time timestamptz; v_threshold CONSTANT numeric := 0.98; v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF v_uid IS NULL OR p_workspace IS NULL OR p_send_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=v_uid AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid batch' USING ERRCODE='22023'; END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(v_event)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_event))<>5 OR NOT(v_event ?& ARRAY['bookId','deltaSeconds','position','clientUpdatedAt','pagesRead']) OR jsonb_typeof(v_event->'bookId')<>'string' OR (v_event->>'bookId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(v_event->'deltaSeconds')<>'number' OR jsonb_typeof(v_event->'position')<>'number' OR jsonb_typeof(v_event->'clientUpdatedAt')<>'string' OR (v_event->'pagesRead'<>'null'::jsonb AND jsonb_typeof(v_event->'pagesRead')<>'number') THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
  IF (v_event->>'deltaSeconds')::numeric NOT BETWEEN 0 AND 120 OR trunc((v_event->>'deltaSeconds')::numeric)<>(v_event->>'deltaSeconds')::numeric OR (v_event->>'position')::numeric NOT BETWEEN 0 AND 1 OR ((v_event->>'pagesRead') IS NOT NULL AND ((v_event->>'pagesRead')::integer<0 OR trunc((v_event->>'pagesRead')::numeric)<>(v_event->>'pagesRead')::numeric)) THEN RAISE EXCEPTION 'invalid bounds' USING ERRCODE='22023'; END IF;
  v_client_time := (v_event->>'clientUpdatedAt')::timestamptz;
  IF NOT EXISTS(SELECT 1 FROM public.books b WHERE b.id=(v_event->>'bookId')::uuid AND b.workspace_id=p_workspace AND b.owner_id=v_uid) THEN RAISE EXCEPTION 'unknown book' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'bookId') FROM jsonb_array_elements(p_events))<>jsonb_array_length(p_events) OR (SELECT sum((value->>'deltaSeconds')::integer) FROM jsonb_array_elements(p_events))>120 THEN RAISE EXCEPTION 'duplicate book or excessive delta' USING ERRCODE='22023'; END IF;
 INSERT INTO public.book_progress_batches(workspace_id,user_id,send_id,events) VALUES(p_workspace,v_uid,p_send_id,p_events) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN SELECT events INTO v_prior FROM public.book_progress_batches WHERE workspace_id=p_workspace AND user_id=v_uid AND send_id=p_send_id; IF v_prior IS DISTINCT FROM p_events THEN RAISE EXCEPTION 'send id reused' USING ERRCODE='22023'; END IF; RETURN jsonb_build_object('duplicate',true,'sendId',p_send_id); END IF;
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  v_progress := (v_event->>'position')::numeric;
  INSERT INTO public.book_reading_state(workspace_id,book_id,user_id,position,pages_read,client_updated_at,finished_at) VALUES(p_workspace,(v_event->>'bookId')::uuid,v_uid,v_progress,NULLIF(v_event->>'pagesRead','null')::integer,(v_event->>'clientUpdatedAt')::timestamptz,CASE WHEN v_progress>=v_threshold THEN now() END)
  ON CONFLICT(workspace_id,book_id,user_id) DO UPDATE SET position=EXCLUDED.position,pages_read=EXCLUDED.pages_read,client_updated_at=EXCLUDED.client_updated_at,updated_at=now(),finished_at=CASE WHEN EXCLUDED.position>=v_threshold THEN coalesce(public.book_reading_state.finished_at,now()) ELSE NULL END
  WHERE EXCLUDED.client_updated_at>public.book_reading_state.client_updated_at;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO public.book_reading_sessions(workspace_id,book_id,user_id,day,seconds) VALUES(p_workspace,(v_event->>'bookId')::uuid,v_uid,v_day,(v_event->>'deltaSeconds')::integer) ON CONFLICT(workspace_id,book_id,user_id,day) DO UPDATE SET seconds=least(public.book_reading_sessions.seconds+EXCLUDED.seconds,86400),updated_at=now();
  IF v_rows>0 THEN UPDATE public.books SET status=CASE WHEN v_progress>=v_threshold THEN 'finished' ELSE status END,updated_at=now() WHERE id=(v_event->>'bookId')::uuid AND workspace_id=p_workspace; END IF;
 END LOOP;
 RETURN jsonb_build_object('duplicate',false,'sendId',p_send_id);
END $fn$;
REVOKE ALL ON FUNCTION public.book_record_progress_batch(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_record_progress_batch(uuid,uuid,jsonb) TO authenticated;
COMMIT;
