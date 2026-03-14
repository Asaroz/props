-- Migration: friend_profile_visibility
-- Allows authenticated users to read the profiles of their confirmed friends.
-- This unblocks display-name lookups in the frontend without exposing profiles
-- to arbitrary unauthenticated or unrelated users.

-- Drop the existing broad SELECT policy if it only covers self-reads, then
-- replace it with one that also covers confirmed friends.
-- We use a safe drop-and-recreate approach so the migration is idempotent.

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_read_own_or_friend" on public.profiles;

create policy "profiles_read_own_or_friend"
on public.profiles
for select
to authenticated
using (
  -- own profile
  id = auth.uid()
  or
  -- confirmed friend
  exists (
    select 1 from public.friendships f
    where (f.user_one_id = auth.uid() and f.user_two_id = profiles.id)
       or (f.user_one_id = profiles.id and f.user_two_id = auth.uid())
  )
);
