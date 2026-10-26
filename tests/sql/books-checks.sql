DO $$ DECLARE x jsonb; n integer; BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.books'::regclass) THEN RAISE EXCEPTION 'books RLS disabled'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('books','book_files','book_reading_state','book_reading_sessions','book_progress_batches','book_annotations','book_collections','book_collection_items','book_user_preferences'))<>9 THEN RAISE EXCEPTION 'expected owner policies for all books tables'; END IF;
 IF has_table_privilege('authenticated','public.book_progress_batches','SELECT') OR has_table_privilege('authenticated','public.book_reading_state','UPDATE') THEN RAISE EXCEPTION 'progress internals are directly writable/readable'; END IF;
 IF NOT has_function_privilege('authenticated','public.book_record_progress_batch(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.book_record_progress_batch(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'progress RPC grants incorrect'; END IF;
 IF (SELECT public FROM storage.buckets WHERE id='books') IS DISTINCT FROM false THEN RAISE EXCEPTION 'books storage must be private'; END IF;
 IF NOT ((SELECT allowed_mime_types FROM storage.buckets WHERE id='books') @> ARRAY['image/webp']) THEN RAISE EXCEPTION 'private books storage must accept compressed cover images'; END IF;
 IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.books'::regclass AND attname IN ('cover_path','cover_thumb_path') AND NOT attisdropped)<>2 THEN RAISE EXCEPTION 'book cover paths missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.book_annotations'::regclass AND attname='anchor_cfi' AND NOT attisdropped) THEN RAISE EXCEPTION 'annotation anchor missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.book_annotations'::regclass AND attname='send_id' AND NOT attisdropped) OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.book_reading_state'::regclass AND attname='device_id' AND NOT attisdropped) THEN RAISE EXCEPTION 'offline sync identity columns missing'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.book_user_preferences'::regclass) THEN RAISE EXCEPTION 'book preferences RLS disabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.book_annotations'::regclass AND attname='deleted_at' AND NOT attisdropped) THEN RAISE EXCEPTION 'soft delete column missing'; END IF;
END $$;
INSERT INTO public.books(id,workspace_id,owner_id,title,format) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Fixture owner one','epub'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Fixture owner two','pdf');
UPDATE public.books SET cover_path='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/covers/cover-12345678-1234-4234-8234-123456789abc.webp', cover_thumb_path='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/covers/thumb-12345678-1234-4234-8234-123456789abc.webp' WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $$ BEGIN
 BEGIN UPDATE public.books SET cover_path='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc/covers/cover-12345678-1234-4234-8234-123456789abc.webp' WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; RAISE EXCEPTION 'cover path outside its owner scope was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; SET ROLE authenticated;
DO $$ DECLARE x jsonb; s public.book_reading_state%rowtype; d integer; b text; BEGIN
 INSERT INTO public.book_annotations(workspace_id,book_id,user_id,kind,body,position,anchor_cfi,send_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','highlight','Selected passage',0.1,'epubcfi(/6/2[chapter]!/4/1:0)','99999999-9999-4999-8999-999999999999');
 INSERT INTO public.book_annotations(workspace_id,book_id,user_id,kind,body,position,anchor_cfi,send_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','highlight','Selected passage',0.1,'epubcfi(/6/2[chapter]!/4/1:0)','99999999-9999-4999-8999-999999999999') ON CONFLICT(user_id,send_id) DO NOTHING;
 IF (SELECT count(*) FROM public.book_annotations WHERE send_id='99999999-9999-4999-8999-999999999999')<>1 THEN RAISE EXCEPTION 'annotation send_id replay was not deduplicated'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.book_annotations WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND anchor_cfi='epubcfi(/6/2[chapter]!/4/1:0)') THEN RAISE EXCEPTION 'book annotation CFI anchor not saved'; END IF;
 INSERT INTO public.book_user_preferences(workspace_id,user_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 IF (SELECT daily_goal_minutes FROM public.book_user_preferences WHERE workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>30 THEN RAISE EXCEPTION 'default daily reading goal must be 30 minutes'; END IF;
 INSERT INTO public.book_annotations(workspace_id,book_id,user_id,send_id,kind,body,position) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','bookmark','At 25%',0.25);
 x:=public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":30,"position":0.5,"clientUpdatedAt":"2026-10-26T12:00:00Z","pagesRead":10,"deviceId":"11111111-1111-4111-8111-111111111111"}]'::jsonb);
 IF x->>'duplicate'<>'false' THEN RAISE EXCEPTION 'first batch not recorded as new: %',x; END IF;
 x:=public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":30,"position":0.5,"clientUpdatedAt":"2026-10-26T12:00:00Z","pagesRead":10,"deviceId":"11111111-1111-4111-8111-111111111111"}]'::jsonb);
 IF x->>'duplicate'<>'true' THEN RAISE EXCEPTION 'replayed send_id must return duplicate true: %',x; END IF;
 x:=public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ffffffff-ffff-4fff-8fff-ffffffffffff','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":10,"position":0.99,"clientUpdatedAt":"2026-10-26T11:00:00Z","pagesRead":99,"deviceId":"11111111-1111-4111-8111-111111111111"}]'::jsonb);
 SELECT * INTO s FROM public.book_reading_state WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF s.position<>0.5 OR s.finished_at IS NOT NULL THEN RAISE EXCEPTION 'stale progress replaced the current state: %',row_to_json(s); END IF;
 SELECT status INTO b FROM public.books WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; IF b<>'active' THEN RAISE EXCEPTION 'stale progress finished the book'; END IF;
 PERFORM public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-abab-4aba-8aba-abababababac','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":0,"position":0.6,"clientUpdatedAt":"2026-10-26T12:00:00Z","pagesRead":11,"deviceId":"22222222-2222-4222-8222-222222222222"}]'::jsonb);
 SELECT * INTO s FROM public.book_reading_state WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; IF s.position<>0.6 OR s.device_id<>'22222222-2222-4222-8222-222222222222' THEN RAISE EXCEPTION 'same-time device ordering did not advance: %',row_to_json(s); END IF;
 PERFORM public.book_record_progress_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','abababab-abab-4aba-8aba-abababababab','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":30,"position":0.98,"clientUpdatedAt":"2026-10-26T12:30:00Z","pagesRead":20,"deviceId":"11111111-1111-4111-8111-111111111111"}]'::jsonb);
 SELECT * INTO s FROM public.book_reading_state WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF s.position<>0.98 OR s.finished_at IS NULL THEN RAISE EXCEPTION 'current progress at 98%% did not finish: %',row_to_json(s); END IF;
 SELECT seconds INTO STRICT d FROM public.book_reading_sessions WHERE book_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF d<>70 THEN RAISE EXCEPTION 'replay or progress session delta incorrect: %',d; END IF;
 SELECT status INTO b FROM public.books WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; IF b<>'finished' THEN RAISE EXCEPTION 'book completion status missing'; END IF;
 IF (SELECT count(*) FROM public.books WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>0 THEN RAISE EXCEPTION 'owner one can read owner two book'; END IF;
 BEGIN PERFORM public.book_record_progress_batch('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','12121212-1212-4121-8121-121212121212','[{"bookId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","deltaSeconds":1,"position":0.1,"clientUpdatedAt":"2026-10-26T11:00:00Z","pagesRead":1,"deviceId":"11111111-1111-4111-8111-111111111111"}]'::jsonb); RAISE EXCEPTION 'cross-workspace owner write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.books WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>0 THEN RAISE EXCEPTION 'owner two can read owner one book'; END IF;
 IF (SELECT count(*) FROM public.book_user_preferences WHERE workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>0 THEN RAISE EXCEPTION 'owner two can read owner one preferences'; END IF;
 IF (SELECT count(*) FROM public.books WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>1 THEN RAISE EXCEPTION 'owner two cannot read their own book'; END IF;
END $$;
RESET ROLE;
