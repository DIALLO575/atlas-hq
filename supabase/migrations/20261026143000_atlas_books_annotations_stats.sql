-- L4: soft-delete annotations, bookmarks, and per-owner reading goals.
BEGIN;
ALTER TABLE public.book_annotations ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.book_annotations DROP CONSTRAINT book_annotations_kind_check;
ALTER TABLE public.book_annotations ADD CONSTRAINT book_annotations_kind_check CHECK(kind IN ('note','highlight','bookmark'));
CREATE INDEX book_annotations_active_idx ON public.book_annotations(workspace_id,book_id,user_id,updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE public.book_user_preferences (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 daily_goal_minutes integer NOT NULL DEFAULT 30 CHECK(daily_goal_minutes BETWEEN 5 AND 360),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
ALTER TABLE public.book_user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_user_preferences FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.book_user_preferences TO authenticated;
CREATE POLICY book_preferences_owner_all ON public.book_user_preferences FOR ALL TO authenticated
 USING(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_user_preferences.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'))
 WITH CHECK(user_id=(select auth.uid()) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=book_user_preferences.workspace_id AND m.user_id=(select auth.uid()) AND m.role='owner'));
COMMIT;
