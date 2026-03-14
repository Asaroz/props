-- Migration: group_invites_accept_membership_bootstrap
-- Ensures invite acceptance reliably creates member membership.

create or replace function public.apply_group_invite_acceptance_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'accepted'
     and new.invitee_id is not null
  then
    insert into public.group_memberships (group_id, user_id, role)
    values (new.group_id, new.invitee_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists group_invites_apply_acceptance_membership on public.group_invites;
create trigger group_invites_apply_acceptance_membership
after update on public.group_invites
for each row
execute function public.apply_group_invite_acceptance_membership();
