-- Fix: eligible third-party friends must be able to read props entries between
-- two of their friends so they can actually vouch in the UI.

drop policy if exists "props_entries_read_related" on public.props_entries;
drop policy if exists "props_entries_read_related_or_mutual_friend" on public.props_entries;

create policy "props_entries_read_related_or_mutual_friend"
  on public.props_entries
  for select
  to authenticated
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or (
      exists (
        select 1
        from public.friendships f
        where (f.user_one_id = auth.uid() and f.user_two_id = props_entries.from_user_id)
           or (f.user_one_id = props_entries.from_user_id and f.user_two_id = auth.uid())
      )
      and exists (
        select 1
        from public.friendships f
        where (f.user_one_id = auth.uid() and f.user_two_id = props_entries.to_user_id)
           or (f.user_one_id = props_entries.to_user_id and f.user_two_id = auth.uid())
      )
    )
  );