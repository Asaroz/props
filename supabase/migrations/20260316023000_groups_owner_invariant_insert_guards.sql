-- Migration: groups_owner_invariant_insert_guards
-- Enforces owner invariant on inserts and ensures groups bootstrap with an owner.

create or replace function public.ensure_group_creator_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do update
    set role = 'owner';

  return new;
end;
$$;

drop trigger if exists groups_insert_creator_owner_membership on public.groups;
create trigger groups_insert_creator_owner_membership
after insert on public.groups
for each row
execute function public.ensure_group_creator_owner_membership();

-- Backfill legacy groups that might have slipped in without owner membership.
insert into public.group_memberships (group_id, user_id, role)
select g.id, g.created_by, 'owner'
from public.groups g
where not exists (
  select 1
  from public.group_memberships gm
  where gm.group_id = g.id
    and gm.role = 'owner'
)
on conflict (group_id, user_id) do update
  set role = 'owner';

create or replace function public.enforce_group_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_group_id uuid;
begin
  if tg_op = 'INSERT' then
    candidate_group_id := new.group_id;

    if exists (
      select 1 from public.groups g where g.id = candidate_group_id
    ) and not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = candidate_group_id
        and gm.role = 'owner'
    ) then
      raise exception 'group must retain at least one owner';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    candidate_group_id := old.group_id;

    if exists (
      select 1 from public.groups g where g.id = candidate_group_id
    ) and not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = candidate_group_id
        and gm.role = 'owner'
    ) then
      raise exception 'group must retain at least one owner';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    candidate_group_id := new.group_id;

    if exists (
      select 1 from public.groups g where g.id = candidate_group_id
    ) and not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = candidate_group_id
        and gm.role = 'owner'
    ) then
      raise exception 'group must retain at least one owner';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists group_memberships_require_owner on public.group_memberships;
create constraint trigger group_memberships_require_owner
after insert or update or delete on public.group_memberships
deferrable initially immediate
for each row
execute function public.enforce_group_has_owner();
