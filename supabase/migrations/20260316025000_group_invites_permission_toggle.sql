-- Migration: group_invites_permission_toggle
-- Adds configurable invite permissions per group and hardens invite insert checks.

alter table public.groups
  add column if not exists invite_permission text not null default 'owner_only'
  check (invite_permission in ('owner_only', 'member_invite'));

comment on column public.groups.invite_permission is
  'Controls who can invite users: owner_only or member_invite.';

create or replace function public.can_invite_to_group(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_group_owner(target_group_id, target_user_id) then true
    when exists (
      select 1
      from public.groups g
      where g.id = target_group_id
        and g.invite_permission = 'member_invite'
    ) then public.is_group_member(target_group_id, target_user_id)
    else false
  end;
$$;

revoke execute on function public.can_invite_to_group(uuid, uuid) from public, anon;
grant execute on function public.can_invite_to_group(uuid, uuid) to authenticated;

drop policy if exists "group_invites_insert_owner" on public.group_invites;
create policy "group_invites_insert_owner"
  on public.group_invites
  for insert
  to authenticated
  with check (
    inviter_id = auth.uid()
    and public.can_invite_to_group(group_id, auth.uid())
    and status = 'pending'
    and responded_at is null
    and not exists (
      select 1
      from public.group_memberships gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = group_invites.invitee_id
    )
  );
