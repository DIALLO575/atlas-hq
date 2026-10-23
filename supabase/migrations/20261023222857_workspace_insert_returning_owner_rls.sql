-- Applied to the production Supabase project on 2026-10-23 as
-- 20261023222857_workspace_insert_returning_owner_rls.
--
-- When PostgREST inserts a workspace with representation/RETURNING id,
-- PostgreSQL also evaluates the SELECT RLS policy on the new row.
-- The AFTER INSERT owner-membership trigger may not yet have created
-- the corresponding workspace_members record when this check occurs.
-- Let the verified creator see their own workspace, without widening
-- another user's access; membership-based reads remain unchanged.
alter policy workspaces_read_member on public.workspaces
  to authenticated
  using (
    created_by = (select auth.uid())
    or private.is_workspace_member(id)
  );
