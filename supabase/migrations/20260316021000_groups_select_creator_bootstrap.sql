-- Migration: groups_select_creator_bootstrap
-- Allows creators to read newly created groups before membership bootstrap is written.

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (
    public.is_group_member(id, auth.uid())
    or created_by = auth.uid()
  );
