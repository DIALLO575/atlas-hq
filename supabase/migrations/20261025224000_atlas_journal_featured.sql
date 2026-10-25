-- Optional, backward-compatible "à la une" flag (contract v1 `featured`, default false). NOT applied automatically.
ALTER TABLE public.journal_items ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
