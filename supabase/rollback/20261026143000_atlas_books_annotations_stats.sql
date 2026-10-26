-- Manual rollback for L4 book annotations and reading preferences.
BEGIN;
DROP TABLE public.book_user_preferences;
DROP INDEX public.book_annotations_active_idx;
ALTER TABLE public.book_annotations DROP COLUMN deleted_at;
ALTER TABLE public.book_annotations DROP CONSTRAINT book_annotations_kind_check;
ALTER TABLE public.book_annotations ADD CONSTRAINT book_annotations_kind_check CHECK(kind IN ('note','highlight'));
COMMIT;
