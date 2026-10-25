-- Morning journal (WORLD RADAR) per-user reading state. NOT applied automatically:
-- apply manually after review. Stores no article content, URLs, tokens or secrets.
CREATE TABLE IF NOT EXISTS public.feed_item_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  edition_id text NOT NULL CHECK (edition_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  item_id text NOT NULL CHECK (item_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  status text NOT NULL CHECK (status IN ('new', 'read', 'done')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_item_state_unique UNIQUE (user_id, workspace_id, edition_id, item_id)
);
CREATE INDEX IF NOT EXISTS feed_item_state_edition_idx
  ON public.feed_item_state(user_id, workspace_id, edition_id);
ALTER TABLE public.feed_item_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_item_state FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.feed_item_state TO authenticated;

-- Owner-only: the row belongs to the caller AND the caller owns the workspace.
DROP POLICY IF EXISTS feed_item_state_owner_select ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_select ON public.feed_item_state FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS feed_item_state_owner_insert ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_insert ON public.feed_item_state FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS feed_item_state_owner_update ON public.feed_item_state;
CREATE POLICY feed_item_state_owner_update ON public.feed_item_state FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = feed_item_state.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'))
  WITH CHECK (user_id = auth.uid());
