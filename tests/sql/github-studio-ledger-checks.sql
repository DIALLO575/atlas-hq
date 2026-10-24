-- GitHub Studio ledger: actual migration under restricted PostgreSQL roles.
insert into public.atlas_github_installations (
 installation_id,workspace_id,status,repository_selection,
 ownership_verified_at,repositories_verified_at
) values
 (77,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','repositories-ready',
  'selected',clock_timestamp(),clock_timestamp()),
 (88,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','repositories-ready',
  'all',clock_timestamp(),clock_timestamp());

do $$
declare tbl text; actor_role text;
begin
 foreach tbl in array array[
   'atlas_github_studio_operations','atlas_github_studio_audit'
 ] loop
   if not (select relrowsecurity from pg_class
      where oid=('public.'||tbl)::regclass) then
      raise exception 'RLS missing for %',tbl;end if;
   foreach actor_role in array array['anon','authenticated'] loop
     if has_table_privilege(actor_role,('public.'||tbl),'SELECT') or
        has_table_privilege(actor_role,('public.'||tbl),'INSERT') or
        has_table_privilege(actor_role,('public.'||tbl),'UPDATE') or
        has_table_privilege(actor_role,('public.'||tbl),'DELETE') then
       raise exception 'Browser privileges exist on % for %',tbl,actor_role;
     end if;
   end loop;
 end loop;
 if has_table_privilege('service_role','public.atlas_github_studio_audit','UPDATE')
    or has_table_privilege('service_role','public.atlas_github_studio_audit','DELETE')
    or has_function_privilege('authenticated',
       'public.atlas_gh_studio_reserve(uuid,uuid,bigint,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon',
       'public.atlas_gh_studio_advance(uuid,text,text,bigint,text)','EXECUTE')
 then raise exception 'Audit grants or service-only RPC grants unsafe';end if;
end $$;

set role service_role;

do $$
declare r record; next_state text; v_count integer;
begin
 select * into r from public.atlas_gh_studio_reserve(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',77,
  '10000000-0000-4000-8000-000000000001',
  'repo-one','private',repeat('a',64));
 if r.operation_id is null or r.operation_state<>'prepared' or r.already_exists then
  raise exception 'First reserve should create prepared';end if;

 select * into r from public.atlas_gh_studio_reserve(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',77,
  '10000000-0000-4000-8000-000000000001',
  'repo-one','private',repeat('a',64));
 if r.operation_id is null or not r.already_exists or r.operation_state<>'prepared' then
   raise exception 'Idempotent retry unexpectedly changed state';end if;
 select count(*) into v_count from public.atlas_github_studio_audit
   where operation_id=r.operation_id;
 if v_count<>1 then raise exception 'Idempotent reserve duplicated audit event';end if;

 begin
   perform public.atlas_gh_studio_reserve(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',77,
    '10000000-0000-4000-8000-000000000001',
    'changed-name','private',repeat('b',64));
   raise exception 'Changed retry accepted';
 exception when unique_violation then null;end;

 begin
   perform public.atlas_gh_studio_reserve(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',77,
    '10000000-0000-4000-8000-000000000002',
    'repo-two','private',repeat('c',64));
   raise exception 'Cross tenant actor accepted';
 exception when insufficient_privilege then null;end;

 -- Different UUID for the SAME repo name is also single-flight.
 begin
   perform public.atlas_gh_studio_reserve(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',77,
    '10000000-0000-4000-8000-000000000009',
    'repo-one','private',repeat('f',64));
   raise exception 'Second intention for same repository accepted';
 exception when unique_violation then null;end;

 -- Single dispatch wins. A second request may never call POST again.
 next_state := public.atlas_gh_studio_advance(r.operation_id,'prepared','dispatching');
 if next_state <> 'dispatching' then raise exception 'Did not dispatch';end if;
 begin
   perform public.atlas_gh_studio_advance(r.operation_id,'prepared','dispatching');
   raise exception 'Second dispatch accepted';
 exception when serialization_failure then null;end;
 next_state := public.atlas_gh_studio_advance(r.operation_id,'dispatching','provider_confirmed',505);
 if next_state <> 'provider_confirmed' then raise exception 'Provider confirmation failed';end if;
 begin
   perform public.atlas_gh_studio_advance(r.operation_id,'provider_confirmed','succeeded');
   raise exception 'Succeeded without selected repository grant';
 exception when insufficient_privilege then null;end;

 insert into public.atlas_github_authorized_repositories(installation_id,repository_id)
 values(77,505);
 next_state := public.atlas_gh_studio_advance(r.operation_id,'provider_confirmed','succeeded');
 if next_state <> 'succeeded' then raise exception 'Reconciliation failed';end if;
 select count(*) into v_count from public.atlas_github_studio_audit where operation_id=r.operation_id;
 if v_count<>4 then raise exception 'Unexpected audit count: %',v_count;end if;
 if exists(select 1 from public.atlas_github_studio_audit where error_code is not null) then
   raise exception 'Error payload should not be logged';end if;

 -- Another actor cannot use the first workspace installation for a foreign workspace.
 begin
   perform public.atlas_gh_studio_reserve(
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
     '22222222-2222-4222-8222-222222222222',77,
     '10000000-0000-4000-8000-000000000003',
     'foreign-repo','private',repeat('d',64));
   raise exception 'Cross-workspace installation accepted';
 exception when insufficient_privilege then null;end;
end $$;

-- Add a fresh operation for cross-process dispatch test; never mark it succeeded.
select operation_id from public.atlas_gh_studio_reserve(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',77,
 '10000000-0000-4000-8000-000000000004',
 'race-fixture','private',repeat('e',64)
);
reset role;
