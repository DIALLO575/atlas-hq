-- Owner-initiated direct MAUSBOT commands. Installed separately; this migration
-- does NOT switch on production execution or grant any MAUSBOT server privileges.
-- Never store bearer tokens, instruction text, or provider payloads here.
CREATE TABLE IF NOT EXISTS public.atlas_mausbot_action_audit (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primitive text NOT NULL CHECK (length(primitive) BETWEEN 3 AND 100),
  intent_sha256 text NOT NULL CHECK (intent_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'accepted', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS atlas_mausbot_action_actor_idx
  ON public.atlas_mausbot_action_audit(workspace_id, actor_id, created_at DESC);
ALTER TABLE public.atlas_mausbot_action_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_mausbot_action_audit FROM PUBLIC, anon, authenticated;

-- The authenticated ATLAS owner may reserve exactly one operation id. A
-- duplicate ID cannot dispatch again, even after an upstream timeout.
CREATE OR REPLACE FUNCTION public.atlas_mausbot_action_begin(
  p_action_id uuid, p_workspace_id uuid, p_primitive text, p_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id = p_workspace_id
       AND m.user_id = auth.uid() AND m.role = 'owner'
  ) THEN RAISE EXCEPTION 'MAUSBOT_OWNER_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_action_id IS NULL OR p_primitive IS NULL OR
     p_primitive !~ '^[a-z][a-z0-9.-]{2,99}$' OR
     p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'MAUSBOT_ACTION_INVALID' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.atlas_mausbot_action_audit
    (id, workspace_id, actor_id, primitive, intent_sha256)
    VALUES (p_action_id, p_workspace_id, auth.uid(), p_primitive, p_hash)
    ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_mausbot_action_complete(
  p_action_id uuid, p_state text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR p_state NOT IN ('accepted', 'unknown') THEN
    RAISE EXCEPTION 'MAUSBOT_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.atlas_mausbot_action_audit a
    SET state = p_state, finished_at = now()
    WHERE a.id = p_action_id AND a.actor_id = auth.uid() AND a.state = 'reserved'
      AND EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = a.workspace_id
        AND m.user_id = auth.uid() AND m.role = 'owner'
      );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.atlas_mausbot_action_begin(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atlas_mausbot_action_complete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atlas_mausbot_action_begin(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_mausbot_action_complete(uuid, text) TO authenticated;
