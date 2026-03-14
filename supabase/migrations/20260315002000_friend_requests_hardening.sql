drop policy if exists "friend_requests_manage_own" on public.friend_requests;
drop policy if exists "friend_requests_select_related" on public.friend_requests;
drop policy if exists "friend_requests_insert_sender_only" on public.friend_requests;
drop policy if exists "friend_requests_update_sender_resend" on public.friend_requests;
drop policy if exists "friend_requests_update_receiver_respond" on public.friend_requests;

create policy "friend_requests_select_related"
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "friend_requests_insert_sender_only"
  on public.friend_requests
  for insert
  to authenticated
  with check (auth.uid() = sender_id);

create policy "friend_requests_update_sender_resend"
  on public.friend_requests
  for update
  to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

create policy "friend_requests_update_receiver_respond"
  on public.friend_requests
  for update
  to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create or replace function public.enforce_friend_request_update_rules()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id <> old.sender_id or new.receiver_id <> old.receiver_id then
    raise exception 'friend request participants cannot be changed';
  end if;

  if auth.uid() = old.receiver_id then
    if old.status <> 'pending' then
      raise exception 'receiver can only respond to pending requests';
    end if;

    if new.status not in ('accepted', 'rejected') then
      raise exception 'receiver can only set status to accepted or rejected';
    end if;

    return new;
  end if;

  if auth.uid() = old.sender_id then
    if old.status <> 'rejected' or new.status <> 'pending' then
      raise exception 'sender can only reopen a rejected request to pending';
    end if;

    return new;
  end if;

  raise exception 'not allowed to update this request';
end;
$$;

drop trigger if exists friend_requests_enforce_update_rules on public.friend_requests;
create trigger friend_requests_enforce_update_rules
before update on public.friend_requests
for each row
execute function public.enforce_friend_request_update_rules();
