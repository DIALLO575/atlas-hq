-- Manual rollback for 20261026133500_atlas_book_annotation_anchor.sql.
BEGIN;
ALTER TABLE public.book_annotations DROP COLUMN IF EXISTS anchor_cfi;
COMMIT;
