create or replace function public.enforce_props_entry_friendship()
returns trigger
language plpgsql
as $$
begin
  if new.from_user_id = new.to_user_id then
    raise exception 'cannot create props entry to self';
  end if;

  if not exists (
    select 1
    from public.friendships f
    where
      (f.user_one_id = new.from_user_id and f.user_two_id = new.to_user_id)
      or
      (f.user_one_id = new.to_user_id and f.user_two_id = new.from_user_id)
  ) then
    raise exception 'props entries require an active friendship';
  end if;

  return new;
end;
$$;

drop trigger if exists props_entries_require_friendship on public.props_entries;
create trigger props_entries_require_friendship
before insert on public.props_entries
for each row
execute function public.enforce_props_entry_friendship();
