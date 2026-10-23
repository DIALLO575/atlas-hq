-- Atlas Missions + Inbox workflow (new, additive tables only).
-- Apply only after reviewing in a disposable Supabase database; privileges are workspace scoped.
create table if not exists public.atlas_missions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'planned' check (status in ('planned', 'active', 'review', 'done')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists atlas_missions_workspace_updated_idx on public.atlas_missions(workspace_id, updated_at desc);

create table if not exists public.atlas_mission_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mission_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint atlas_review_mission_workspace_fk foreign key (mission_id, workspace_id)
    references public.atlas_missions(id, workspace_id) on delete cascade,
  constraint atlas_review_decision_audit_check check (
    (decision = 'pending' and decided_by is null and decided_at is null)
    or (decision <> 'pending' and decided_by is not null and decided_at is not null)
  )
);
create unique index if not exists atlas_mission_reviews_one_pending_idx
  on public.atlas_mission_reviews(mission_id) where decision='pending';
create index if not exists atlas_mission_reviews_workspace_created_idx
  on public.atlas_mission_reviews(workspace_id, created_at desc);

create or replace function private.touch_atlas_mission()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_atlas_mission() from public, anon, authenticated;
drop trigger if exists atlas_mission_touch on public.atlas_missions;
create trigger atlas_mission_touch before update on public.atlas_missions
  for each row execute function private.touch_atlas_mission();

create or replace function private.stamp_atlas_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.decision <> 'pending' or new.decision not in ('approved', 'rejected') then
    raise exception 'INVALID_REVIEW_TRANSITION';
  end if;
  new.decided_by = auth.uid();
  new.decided_at = now();
  return new;
end;
$$;
revoke all on function private.stamp_atlas_review() from public, anon, authenticated;
drop trigger if exists atlas_review_stamp on public.atlas_mission_reviews;
create trigger atlas_review_stamp before update on public.atlas_mission_reviews
  for each row execute function private.stamp_atlas_review();

alter table public.atlas_missions enable row level security;
alter table public.atlas_mission_reviews enable row level security;
revoke all on public.atlas_missions, public.atlas_mission_reviews from public, anon, authenticated;
grant select, insert on public.atlas_missions to authenticated;
grant update(status) on public.atlas_missions to authenticated;
grant select, insert on public.atlas_mission_reviews to authenticated;
grant update(decision) on public.atlas_mission_reviews to authenticated;

drop policy if exists atlas_missions_read on public.atlas_missions;
create policy atlas_missions_read on public.atlas_missions for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists atlas_missions_create on public.atlas_missions;
create policy atlas_missions_create on public.atlas_missions for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
drop policy if exists atlas_missions_progress on public.atlas_missions;
create policy atlas_missions_progress on public.atlas_missions for update to authenticated
  using (created_by = (select auth.uid()) or private.is_workspace_admin(workspace_id))
  with check (created_by = (select auth.uid()) or private.is_workspace_admin(workspace_id));

drop policy if exists atlas_reviews_read on public.atlas_mission_reviews;
create policy atlas_reviews_read on public.atlas_mission_reviews for select to authenticated
  using (private.is_workspace_admin(workspace_id) or requested_by = (select auth.uid()));
drop policy if exists atlas_reviews_create on public.atlas_mission_reviews;
create policy atlas_reviews_create on public.atlas_mission_reviews for insert to authenticated
  with check (
    requested_by = (select auth.uid()) and decision = 'pending'
    and decided_by is null and decided_at is null
    and exists (select 1 from public.atlas_missions m
      where m.id = mission_id and m.workspace_id = atlas_mission_reviews.workspace_id
      and (m.created_by = (select auth.uid()) or private.is_workspace_admin(m.workspace_id)))
  );
drop policy if exists atlas_reviews_decide on public.atlas_mission_reviews;
create policy atlas_reviews_decide on public.atlas_mission_reviews for update to authenticated
  using (decision = 'pending' and private.is_workspace_admin(workspace_id))
  with check (decision in ('approved', 'rejected') and private.is_workspace_admin(workspace_id));

-- Transactional, SECURITY INVOKER RPCs. All table RLS and column grants still apply.
create or replace function public.request_atlas_mission_review(_mission_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare m public.atlas_missions%rowtype; review_id uuid;
begin
  update public.atlas_missions set status = 'review'
    where id = _mission_id and status in ('planned', 'active')
      and (created_by = auth.uid() or private.is_workspace_admin(workspace_id))
    returning * into m;
  if not found then raise exception 'MISSION_NOT_REVIEWABLE'; end if;
  insert into public.atlas_mission_reviews(workspace_id, mission_id, requested_by)
    values (m.workspace_id, m.id, auth.uid()) returning id into review_id;
  return review_id;
end;
$$;
revoke all on function public.request_atlas_mission_review(uuid) from public, anon;
grant execute on function public.request_atlas_mission_review(uuid) to authenticated;

create or replace function public.decide_atlas_mission_review(_review_id uuid, _decision text)
returns void language plpgsql security invoker set search_path = '' as $$
declare review public.atlas_mission_reviews%rowtype;
begin
  if _decision not in ('approved', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  update public.atlas_mission_reviews set decision = _decision
    where id = _review_id and decision = 'pending'
      and private.is_workspace_admin(workspace_id)
    returning * into review;
  if not found then raise exception 'REVIEW_NOT_DECIDABLE'; end if;
  update public.atlas_missions
    set status = case when _decision = 'approved' then 'done' else 'active' end
    where id = review.mission_id and workspace_id = review.workspace_id;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.decide_atlas_mission_review(uuid, text) from public, anon;
grant execute on function public.decide_atlas_mission_review(uuid, text) to authenticated;
