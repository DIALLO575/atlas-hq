-- PostgreSQL-only regression tests for the finalizer and rollback.
-- Depends on github-studio-ledger-checks.sql and fake GitHub accounts.
-- All mutations here occur ONLY in disposable CI PostgreSQL.
create function public.gh_studio_test_audit_abort() returns trigger
language plpgsql as $$
begin
 if new.state='succeeded' and new.installation_id=77 then
   raise exception 'GH_STUDIO_TEST_AUDIT_ABORT';
 end if;
 return new;
end $$;
create trigger gh_studio_test_audit_abort_before_insert
 before insert on public.atlas_github_studio_audit
 for each row execute function public.gh_studio_test_audit_abort();

set role service_role;
do $$
declare v record; v_total int;
begin
 -- A repository created at GitHub is confirmed, but audit storage fails.
 select * into v from public.atlas_gh_studio_reserve(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',77,
   '10000000-0000-4000-8000-000000000005',
   'audit-rollback-fixture','private',repeat('b',64));
 perform public.atlas_gh_studio_advance(v.operation_id,'prepared','dispatching');
 perform public.atlas_gh_studio_advance(v.operation_id,'dispatching','provider_confirmed',707);
 begin
   perform public.atlas_gh_studio_finalize_repository(v.operation_id,707);
   raise exception 'Finalizer accepted despite audit failing';
 exception when raise_exception then
   if sqlerrm <> 'GH_STUDIO_TEST_AUDIT_ABORT' then raise; end if;
 end;
 if exists(select 1 from public.atlas_github_authorized_repositories
    where installation_id=77 and repository_id=707)
  or not exists(select 1 from public.atlas_github_studio_operations
    where id=v.operation_id and state='provider_confirmed' and repository_id=707) then
   raise exception 'Failed audit did not roll back grant and success state';end if;
 select count(*) into v_total from public.atlas_github_studio_audit where operation_id=v.operation_id;
 if v_total <> 3 then raise exception 'Audit rollback appended a spurious success event';end if;
end $$;
reset role;
drop trigger gh_studio_test_audit_abort_before_insert
 on public.atlas_github_studio_audit;
drop function public.gh_studio_test_audit_abort();

set role service_role;
do $$
declare v record; v_total integer;
begin
 -- The all-repositories installation is already live-granted. No selected
 -- repository grant row is created by the finalizer in this mode.
 select * into v from public.atlas_gh_studio_reserve(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '22222222-2222-4222-8222-222222222222',88,
   '10000000-0000-4000-8000-000000000006',
   'all-mode-test','private',repeat('c',64));
 perform public.atlas_gh_studio_advance(v.operation_id,'prepared','dispatching');
 perform public.atlas_gh_studio_advance(v.operation_id,'dispatching','provider_confirmed',808);
 if public.atlas_gh_studio_finalize_repository(v.operation_id,808) is not true then
   raise exception 'All-mode finalization failed';end if;
 if exists(select 1 from public.atlas_github_authorized_repositories
      where installation_id=88 and repository_id=808) then
    raise exception 'All-mode finalizer wrote a redundant selected repo grant';end if;

 -- Suspended installation must deny finalization and preserve the operation.
 select * into v from public.atlas_gh_studio_reserve(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '22222222-2222-4222-8222-222222222222',88,
   '10000000-0000-4000-8000-000000000007',
   'revoked-test','private',repeat('d',64));
 perform public.atlas_gh_studio_advance(v.operation_id,'prepared','dispatching');
 perform public.atlas_gh_studio_advance(v.operation_id,'dispatching','provider_confirmed',809);
 update public.atlas_github_installations set status='suspended'
 where installation_id=88;
 begin
   perform public.atlas_gh_studio_finalize_repository(v.operation_id,809);
   raise exception 'Suspended installation finalized';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from public.atlas_github_studio_operations
    where id=v.operation_id and state='succeeded') then
   raise exception 'Revoked installation reached succeeded';end if;
 update public.atlas_github_installations set status='repositories-ready'
 where installation_id=88;
end $$;
reset role;
