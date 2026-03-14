-- Migration: group_memberships_insert_owner_only
-- Restricts membership inserts to current group owners only.
-- Removes legacy creator-bootstrap exception to prevent privilege regain paths.

drop policy if exists "group_memberships_insert_owner" on public.group_memberships;
create policy "group_memberships_insert_owner"
  on public.group_memberships
  for insert
  to authenticated
  with check (
    public.is_group_owner(group_id, auth.uid())
    and user_id <> auth.uid()
  );
