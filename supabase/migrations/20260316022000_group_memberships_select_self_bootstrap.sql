-- Migration: group_memberships_select_self_bootstrap
-- Allows callers to read their own membership row during insert+select bootstrap.

drop policy if exists "group_memberships_select_member" on public.group_memberships;
create policy "group_memberships_select_member"
  on public.group_memberships
  for select
  to authenticated
  using (
    public.is_group_member(group_id, auth.uid())
    or user_id = auth.uid()
  );
