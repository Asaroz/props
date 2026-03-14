-- Fix: enforce_vouch_eligibility ran as the calling user (SECURITY INVOKER),
-- which caused RLS on props_entries to block the trigger's lookup when the
-- voucher is not a direct participant of the prop.
-- Also replaces the prop_vouches SELECT policy with a SECURITY DEFINER helper
-- to avoid the same RLS-through-subquery issue.

-- 1) Recreate the trigger function as SECURITY DEFINER so it can read
--    props_entries regardless of the caller's RLS restrictions.

create or replace function public.enforce_vouch_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_user_id uuid;
  v_to_user_id   uuid;
begin
  select from_user_id, to_user_id
  into   v_from_user_id, v_to_user_id
  from   public.props_entries
  where  id = new.prop_id;

  if not found then
    raise exception 'props entry not found for vouch';
  end if;

  -- Direct participants may not vouch their own prop.
  if new.user_id = v_from_user_id or new.user_id = v_to_user_id then
    raise exception 'direct participants cannot vouch their own prop';
  end if;

  -- Voucher must be friend of the from_user.
  if not exists (
    select 1 from public.friendships f
    where (f.user_one_id = new.user_id and f.user_two_id = v_from_user_id)
       or (f.user_one_id = v_from_user_id and f.user_two_id = new.user_id)
  ) then
    raise exception 'voucher must be a friend of the props sender';
  end if;

  -- Voucher must be friend of the to_user.
  if not exists (
    select 1 from public.friendships f
    where (f.user_one_id = new.user_id and f.user_two_id = v_to_user_id)
       or (f.user_one_id = v_to_user_id and f.user_two_id = new.user_id)
  ) then
    raise exception 'voucher must be a friend of the props receiver';
  end if;

  return new;
end;
$$;

-- 2) SECURITY DEFINER helper for the prop_vouches SELECT policy.
--    Avoids the same subquery-through-RLS issue for read access.

create or replace function public.is_vouch_eligible_viewer(
  p_prop_id  uuid,
  p_viewer_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_from_user_id uuid;
  v_to_user_id   uuid;
begin
  select from_user_id, to_user_id
  into   v_from_user_id, v_to_user_id
  from   public.props_entries
  where  id = p_prop_id;

  if not found then
    return false;
  end if;

  -- Direct participants can always read vouches on their prop.
  if p_viewer_id = v_from_user_id or p_viewer_id = v_to_user_id then
    return true;
  end if;

  -- Friend of from_user AND friend of to_user.
  return
    exists (
      select 1 from public.friendships f
      where (f.user_one_id = p_viewer_id and f.user_two_id = v_from_user_id)
         or (f.user_one_id = v_from_user_id and f.user_two_id = p_viewer_id)
    )
    and
    exists (
      select 1 from public.friendships f
      where (f.user_one_id = p_viewer_id and f.user_two_id = v_to_user_id)
         or (f.user_one_id = v_to_user_id and f.user_two_id = p_viewer_id)
    );
end;
$$;

-- 3) Swap in the fixed SELECT policy on prop_vouches.

drop policy if exists "prop_vouches_read_eligible" on public.prop_vouches;

create policy "prop_vouches_read_eligible"
on public.prop_vouches
for select
to authenticated
using (
  public.is_vouch_eligible_viewer(prop_vouches.prop_id, auth.uid())
);
