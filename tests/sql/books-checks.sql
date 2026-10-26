DO $$ DECLARE x jsonb; n integer; BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.books'::regclass) THEN RAISE EXCEPTION 'books RLS disabled'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('books','book_files','book_reading_state','book_reading_sessions','book_progress_batches','book_annotations','book_collections','book_collection_items'))<>8 THEN RAISE EXCEPTION 'expected owner policies for all books tables'; END IF;
 IF has_table_privilege('authenticated','public.book_progress_batches','SELECT') OR has_table_privilege('authenticated','public.book_reading_state','UPDATE') THEN RAISE EXCEPTION 'progress internals are directly writable/readable'; END IF;
 IF NOT has_function_privilege('authenticated','public.book_record_progress_batch(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.book_record_progress_batch(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'progress RPC grants incorrect'; END IF;
 IF (SELECT public FROM storage.buckets WHERE id='books') IS DISTINCT FROM false THEN RAISE EXCEPTION 'books storage must be private'; END IF;
END $$;
INSERT INTO public.books(id,workspace_id,owner_id,title,format) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Fixture','epub');
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; SET ROLE authenticated;
SELECT public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":30,"position":0.98,"clientUpdatedAt":"2026-10-26T11:00:00Z","pagesRead":20}]'::jsonb);
SELECT public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":30,"position":0.98,"clientUpdatedAt":"2026-10-26T11:00:00Z","pagesRead":20}]'::jsonb);
SELECT public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ffffffff-ffff-4fff-8fff-ffffffffffff','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":10,"position":0.2,"clientUpdatedAt":"2026-10-26T10:00:00Z","pagesRead":5}]'::jsonb);
DO $$ DECLARE s public.book_reading_state%rowtype; d integer; b text; BEGIN
 SELECT * INTO s FROM public.book_reading_state WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF s.position<>0.98 OR s.finished_at IS NULL THEN RAISE EXCEPTION 'last-write-wins or 98%% finish failed: %',row_to_json(s); END IF;
 SELECT seconds INTO d FROM public.book_reading_sessions WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; IF d<>40 THEN RAISE EXCEPTION 'session delta was not accounted: %',d; END IF;
 SELECT status INTO b FROM public.books WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; IF b<>'finished' THEN RAISE EXCEPTION 'book completion status missing'; END IF;
 IF (SELECT count(*) FROM public.books WHERE workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>0 THEN RAISE EXCEPTION 'workspace isolation failed'; END IF;
 BEGIN PERFORM public.book_record_progress_batch('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','12121212-1212-4121-8121-121212121212','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":1,"position":0.1,"clientUpdatedAt":"2026-10-26T11:00:00Z","pagesRead":1}]'::jsonb); RAISE EXCEPTION 'cross-workspace owner write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
