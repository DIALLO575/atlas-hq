-- Keep the exposed workspace tables closed to anonymous clients and grant
-- authenticated clients only the operations required by their policies.
revoke all privileges on table public.workspaces, public.workspace_members
  from public, anon, authenticated;

-- Clear earlier column grants as well as table-level grants.
do $$
declare
  col record;
begin
  for col in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('workspaces', 'workspace_members')
  loop
    execute format(
      'revoke all privileges (%I) on table public.%I from public, anon, authenticated',
      col.column_name, col.table_name
    );
  end loop;
end;
$$;

grant select, insert, delete on table public.workspaces to authenticated;
revoke update on table public.workspaces from authenticated;
revoke update (id, created_by, created_at, name, updated_at)
  on table public.workspaces from authenticated;
grant update (name, updated_at) on table public.workspaces to authenticated;

grant select, insert, delete on table public.workspace_members to authenticated;
