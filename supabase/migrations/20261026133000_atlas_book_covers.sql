-- L2 cover metadata only. Additive and intentionally not applied automatically.
BEGIN;
ALTER TABLE public.books
  ADD COLUMN cover_path text,
  ADD COLUMN cover_thumb_path text,
  ADD CONSTRAINT books_cover_paths_owner_scope CHECK (
    (cover_path IS NULL OR cover_path ~ ('^' || workspace_id::text || '/' || id::text || '/covers/cover-[a-f0-9-]{36}\.webp$')) AND
    (cover_thumb_path IS NULL OR cover_thumb_path ~ ('^' || workspace_id::text || '/' || id::text || '/covers/thumb-[a-f0-9-]{36}\.webp$'))
  );
UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/epub+zip','application/pdf','image/webp']
WHERE id='books' AND public=false;
COMMIT;
