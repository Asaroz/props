-- Migration: groups_rls_mvp
-- Minimal RLS for groups domain (owner/member, no public discovery).

create or replace function public.is_group_member(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = target_group_id
      and gm.user_id = target_user_id
  );
$$;

create or replace function public.is_group_owner(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = target_group_id
      and gm.user_id = target_user_id
      and gm.role = 'owner'
  );
$$;

revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

revoke execute on function public.is_group_owner(uuid, uuid) from public, anon;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_props_links enable row level security;

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (
    public.is_group_member(id, auth.uid())
    or created_by = auth.uid()
  );

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner"
  on public.groups
  for update
  to authenticated
  using (public.is_group_owner(id, auth.uid()))
  with check (public.is_group_owner(id, auth.uid()));

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner"
  on public.groups
  for delete
  to authenticated
  using (public.is_group_owner(id, auth.uid()));

drop policy if exists "group_memberships_select_member" on public.group_memberships;
create policy "group_memberships_select_member"
  on public.group_memberships
  for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_memberships_insert_owner" on public.group_memberships;
create policy "group_memberships_insert_owner"
  on public.group_memberships
  for insert
  to authenticated
  with check (
    (
      public.is_group_owner(group_id, auth.uid())
      and user_id <> auth.uid()
    )
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1
        from public.groups g
        where g.id = group_memberships.group_id
          and g.created_by = auth.uid()
      )
    )
  );

drop policy if exists "group_memberships_update_owner" on public.group_memberships;
create policy "group_memberships_update_owner"
  on public.group_memberships
  for update
  to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));

drop policy if exists "group_memberships_delete_owner_or_self" on public.group_memberships;
create policy "group_memberships_delete_owner_or_self"
  on public.group_memberships
  for delete
  to authenticated
  using (
    public.is_group_owner(group_id, auth.uid())
    or (
      user_id = auth.uid()
      and role <> 'owner'
    )
  );

drop policy if exists "group_invites_select_related" on public.group_invites;
create policy "group_invites_select_related"
  on public.group_invites
  for select
  to authenticated
  using (
    inviter_id = auth.uid()
    or invitee_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
  );

drop policy if exists "group_invites_insert_owner" on public.group_invites;
create policy "group_invites_insert_owner"
  on public.group_invites
  for insert
  to authenticated
  with check (
    inviter_id = auth.uid()
    and public.is_group_owner(group_id, auth.uid())
    and status = 'pending'
    and responded_at is null
  );

drop policy if exists "group_invites_update_invitee_respond" on public.group_invites;
create policy "group_invites_update_invitee_respond"
  on public.group_invites
  for update
  to authenticated
  using (
    invitee_id = auth.uid()
    and status = 'pending'
  )
  with check (
    invitee_id = auth.uid()
    and status in ('accepted', 'rejected')
    and responded_at is not null
  );

drop policy if exists "group_invites_update_owner_or_inviter_cancel" on public.group_invites;
create policy "group_invites_update_owner_or_inviter_cancel"
  on public.group_invites
  for update
  to authenticated
  using (
    status = 'pending'
    and (
      inviter_id = auth.uid()
      or public.is_group_owner(group_id, auth.uid())
    )
  )
  with check (
    (
      inviter_id = auth.uid()
      or public.is_group_owner(group_id, auth.uid())
    )
    and status = 'canceled'
    and responded_at is not null
  );

drop policy if exists "group_invites_delete_owner" on public.group_invites;
create policy "group_invites_delete_owner"
  on public.group_invites
  for delete
  to authenticated
  using (public.is_group_owner(group_id, auth.uid()));

drop policy if exists "group_props_links_select_member" on public.group_props_links;
create policy "group_props_links_select_member"
  on public.group_props_links
  for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_props_links_insert_member" on public.group_props_links;
create policy "group_props_links_insert_member"
  on public.group_props_links
  for insert
  to authenticated
  with check (
    linked_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "group_props_links_delete_owner_or_actor" on public.group_props_links;
create policy "group_props_links_delete_owner_or_actor"
  on public.group_props_links
  for delete
  to authenticated
  using (
    public.is_group_owner(group_id, auth.uid())
    or linked_by = auth.uid()
  );
