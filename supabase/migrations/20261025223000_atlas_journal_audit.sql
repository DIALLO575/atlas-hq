-- Journal audit trail + quality checks. NOT applied automatically. Writer: service role (n8n / journal-mcp) only.
CREATE TABLE IF NOT EXISTS public.journal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor text NOT NULL CHECK (actor IN ('morgans', 'grok-bot', 'owner', 'n8n')),
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('publish', 'correct', 'state')),
  edition_id text NOT NULL,
  item_id text,
  before jsonb,
  after jsonb,
  reason text CHECK (reason IS NULL OR length(reason) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_audit_lookup_idx ON public.journal_audit(workspace_id, edition_id, at DESC);

CREATE TABLE IF NOT EXISTS public.journal_edition_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  edition_id text NOT NULL,
  item_id text,
  "check" text NOT NULL CHECK ("check" IN ('contract_invalid','missing_source','duplicate_in_edition','duplicate_across_editions','missing_cover','edition_late')),
  severity text NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  detail text NOT NULL CHECK (length(detail) <= 500),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_edition_checks_lookup_idx ON public.journal_edition_checks(workspace_id, edition_id);

ALTER TABLE public.journal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_edition_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_audit, public.journal_edition_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journal_audit, public.journal_edition_checks TO authenticated;

DROP POLICY IF EXISTS journal_audit_owner_read ON public.journal_audit;
CREATE POLICY journal_audit_owner_read ON public.journal_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = journal_audit.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
DROP POLICY IF EXISTS journal_edition_checks_owner_read ON public.journal_edition_checks;
CREATE POLICY journal_edition_checks_owner_read ON public.journal_edition_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = journal_edition_checks.workspace_id AND m.user_id = auth.uid() AND m.role = 'owner'));
