-- Keep tenant ownership immutable after creation. Workspace admins may edit
-- descriptive fields, while RLS still decides which rows they can update.
revoke update on public.workspaces from authenticated;
grant update (name, updated_at) on public.workspaces to authenticated;
