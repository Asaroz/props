-- Migration: group_memberships_require_owner
-- Ensures every existing group retains at least one owner membership.

create or replace function public.enforce_group_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_group_id uuid;
begin
  -- Re-check OLD group after updates/deletes.
  if tg_op in ('UPDATE', 'DELETE') then
    candidate_group_id := old.group_id;

    if exists (
      select 1
      from public.groups g
      where g.id = candidate_group_id
    ) and not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = candidate_group_id
        and gm.role = 'owner'
    ) then
      raise exception 'group must retain at least one owner';
    end if;
  end if;

  -- Re-check NEW group when membership is moved to another group.
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    candidate_group_id := new.group_id;

    if exists (
      select 1
      from public.groups g
      where g.id = candidate_group_id
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
after update or delete on public.group_memberships
deferrable initially immediate
for each row
execute function public.enforce_group_has_owner();
