-- Migration: prop_vouches
-- Adds the vouching table and enforces friend-of-both eligibility at DB level.

create table if not exists public.prop_vouches (
  id          uuid primary key default gen_random_uuid(),
  prop_id     uuid not null references public.props_entries(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (prop_id, user_id)
);

alter table public.prop_vouches enable row level security;

-- SELECT: visible to the direct participants of the prop and to any user
-- who is a friend of both the from_user and the to_user of that prop.
create policy "prop_vouches_read_eligible"
on public.prop_vouches
for select
to authenticated
using (
  exists (
    select 1
    from public.props_entries pe
    where pe.id = prop_vouches.prop_id
      and (
        -- direct participants always see vouches on their prop
        pe.from_user_id = auth.uid()
        or pe.to_user_id = auth.uid()
        -- friend of from_user
        or exists (
          select 1 from public.friendships f
          where (f.user_one_id = auth.uid() and f.user_two_id = pe.from_user_id)
             or (f.user_one_id = pe.from_user_id and f.user_two_id = auth.uid())
        )
      )
      and (
        -- same user must also be friend of to_user (or is a direct participant already handled above)
        pe.from_user_id = auth.uid()
        or pe.to_user_id = auth.uid()
        or exists (
          select 1 from public.friendships f
          where (f.user_one_id = auth.uid() and f.user_two_id = pe.to_user_id)
             or (f.user_one_id = pe.to_user_id and f.user_two_id = auth.uid())
        )
      )
  )
);

-- INSERT: the row's user_id must match the authenticated caller; eligibility
-- is enforced by the trigger below.
create policy "prop_vouches_insert_self"
on public.prop_vouches
for insert
to authenticated
with check (user_id = auth.uid());

-- DELETE: users may only remove their own vouch.
create policy "prop_vouches_delete_own"
on public.prop_vouches
for delete
to authenticated
using (user_id = auth.uid());

-- Trigger: prevent vouching by a direct participant and enforce friend-of-both rule.
create or replace function public.enforce_vouch_eligibility()
returns trigger
language plpgsql
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

drop trigger if exists prop_vouches_eligibility_check on public.prop_vouches;
create trigger prop_vouches_eligibility_check
before insert on public.prop_vouches
for each row
execute function public.enforce_vouch_eligibility();
