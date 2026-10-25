-- Morning journal storage (WORLD RADAR). NOT applied automatically: apply manually after review.
-- Writer: n8n only, with the service role (bypasses RLS). Reader: ATLAS, workspace owner only (RLS).
-- No tokens, secrets or raw webhook payloads are stored here.

CREATE TABLE IF NOT EXISTS public.journal_editions (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  edition_id text NOT NULL CHECK (edition_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  schema_version text NOT NULL CHECK (schema_version = '1'),
  producer text NOT NULL CHECK (producer IN ('morgans', 'grok-bot')),
  generated_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 200),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (workspace_id, edition_id)
);
CREATE INDEX IF NOT EXISTS journal_editions_latest_idx ON public.journal_editions(workspace_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.journal_items (
  workspace_id uuid NOT NULL,
  edition_id text NOT NULL,
  item_id text NOT NULL CHECK (item_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 199),
  topic text NOT NULL CHECK (topic IN ('ia','commerce','guinee','afrique','monde','geopolitique','economie','tech')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  why_it_matters text CHECK (why_it_matters IS NULL OR length(why_it_matters) <= 1000),
  certainty text NOT NULL CHECK (certainty IN ('elevee','moyenne','faible')),
  status text NOT NULL CHECK (status IN ('confirme','rapporte','a_verifier')),
  source_url text NOT NULL CHECK (source_url ~ '^https?://' AND length(source_url) <= 2048),
  source_name text NOT NULL CHECK (length(source_name) BETWEEN 1 AND 120),
  extra_sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(extra_sources) = 'array'),
  published_at timestamptz,
  author_bot text CHECK (author_bot IS NULL OR length(author_bot) <= 60),
  cover jsonb CHECK (cover IS NULL OR (jsonb_typeof(cover) = 'object'
    AND cover->>'storage_path' ~ '^[A-Za-z0-9._-]{1,120}/[A-Za-z0-9._-]{1,150}\.(webp|png|jpg|jpeg)$')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, edition_id, item_id),
  FOREIGN KEY (workspace_id, edition_id) REFERENCES public.journal_editions(workspace_id, edition_id) ON DELETE CASCADE
);

ALTER TABLE public.journal_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_editions, public.journal_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journal_editions, public.journal_items TO authenticated;
-- No INSERT/UPDATE/DELETE grant or policy for authenticated: only service_role (n8n) writes.

DROP POLICY IF EXISTS journal_editions_owner_read ON public.journal_editions;
CREATE POLICY journal_editions_owner_read ON public.journal_editions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = journal_editions.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS journal_items_owner_read ON public.journal_items;
CREATE POLICY journal_items_owner_read ON public.journal_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = journal_items.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));

-- Private bucket for covers. Object path: <workspace_id>/<cover.storage_path>, e.g.
-- 0f…/2026-10-25_matin/ia-1.webp. Uploads by n8n (service role) only; reads via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('journal-covers', 'journal-covers', false, 5242880, ARRAY['image/webp','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Owners may read (= create signed URLs for) objects under their workspace folder only.
DROP POLICY IF EXISTS journal_covers_owner_read ON storage.objects;
CREATE POLICY journal_covers_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'journal-covers' AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id::text = (storage.foldername(name))[1] AND m.user_id = auth.uid() AND m.role = 'owner'));
