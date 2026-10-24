-- SHA-132 disposable PostgreSQL 17 fixture. No Supabase production connection.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
 as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
create schema private;
grant usage on schema private to authenticated,service_role;
create table public.workspaces(id uuid primary key);
create table public.workspace_members(
 workspace_id uuid not null references public.workspaces(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('owner','admin','member')),
 primary key(workspace_id,user_id)
);
create table public.atlas_missions(
 id uuid primary key,workspace_id uuid not null references public.workspaces(id),
 unique(id,workspace_id)
);
create function private.is_workspace_member(_workspace uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members wm
 where wm.workspace_id=_workspace and wm.user_id=auth.uid()) $$;
create function private.is_workspace_admin(_workspace uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members wm
 where wm.workspace_id=_workspace and wm.user_id=auth.uid()
 and wm.role in ('owner','admin')) $$;
revoke all on function private.is_workspace_member(uuid),private.is_workspace_admin(uuid)
 from public,anon;
grant execute on function private.is_workspace_member(uuid),private.is_workspace_admin(uuid)
 to authenticated;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');
insert into public.workspaces(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
insert into public.atlas_missions(id,workspace_id) values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
