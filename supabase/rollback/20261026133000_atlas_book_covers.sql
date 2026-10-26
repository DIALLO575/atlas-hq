-- Manual rollback for 20261026133000_atlas_book_covers.sql.
BEGIN;
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_cover_paths_owner_scope;
ALTER TABLE public.books DROP COLUMN IF EXISTS cover_thumb_path;
ALTER TABLE public.books DROP COLUMN IF EXISTS cover_path;
UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/epub+zip','application/pdf']
WHERE id='books' AND public=false;
COMMIT;
