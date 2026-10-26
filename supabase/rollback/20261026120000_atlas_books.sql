-- Manual rollback for the additive atlas_books migration. Review dependencies before applying.
BEGIN;
DROP FUNCTION IF EXISTS public.book_record_progress_batch(uuid,uuid,jsonb);
DROP POLICY IF EXISTS books_storage_select ON storage.objects;
DROP POLICY IF EXISTS books_storage_insert ON storage.objects;
DROP POLICY IF EXISTS books_storage_update ON storage.objects;
DROP POLICY IF EXISTS books_storage_delete ON storage.objects;
DELETE FROM storage.buckets WHERE id='books';
DROP TABLE IF EXISTS public.book_collection_items, public.book_collections, public.book_annotations, public.book_progress_batches, public.book_reading_sessions, public.book_reading_state, public.book_files, public.books CASCADE;
COMMIT;
