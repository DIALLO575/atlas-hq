-- L2 annotation anchors let EPUB/PDF text highlights survive reloads.
BEGIN;
ALTER TABLE public.book_annotations
  ADD COLUMN anchor_cfi text CHECK (anchor_cfi IS NULL OR length(anchor_cfi) <= 4000);
COMMIT;
