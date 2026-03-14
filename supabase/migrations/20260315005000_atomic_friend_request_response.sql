create or replace function public.respond_to_friend_request(
  input_request_id uuid,
  input_action text
)
returns table (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  sender_display_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  friendship_id uuid,
  friendship_user_one_id uuid,
  friendship_user_two_id uuid,
  friendship_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user_id uuid;
  req public.friend_requests%rowtype;
  updated_req public.friend_requests%rowtype;
  normalized_action text;
  normalized_user_one uuid;
  normalized_user_two uuid;
begin
  acting_user_id := auth.uid();
  if acting_user_id is null then
    raise exception 'not authenticated';
  end if;

  normalized_action := lower(trim(input_action));
  if normalized_action not in ('accept', 'reject') then
    raise exception 'action must be either accept or reject';
  end if;

  select *
  into req
  from public.friend_requests
  where public.friend_requests.id = input_request_id
  for update;

  if not found then
    raise exception 'friend request not found';
  end if;

  if req.receiver_id <> acting_user_id then
    raise exception 'only the receiver can respond to this friend request';
  end if;

  if req.status <> 'pending' then
    raise exception 'this friend request is already %', req.status;
  end if;

  if normalized_action = 'accept' then
    normalized_user_one := least(req.sender_id, req.receiver_id);
    normalized_user_two := greatest(req.sender_id, req.receiver_id);

    begin
      insert into public.friendships (user_one_id, user_two_id)
      values (normalized_user_one, normalized_user_two)
      returning
        public.friendships.id,
        public.friendships.user_one_id,
        public.friendships.user_two_id,
        public.friendships.created_at
      into
        friendship_id,
        friendship_user_one_id,
        friendship_user_two_id,
        friendship_created_at;
    exception
      when unique_violation then
        select
          f.id,
          f.user_one_id,
          f.user_two_id,
          f.created_at
        into
          friendship_id,
          friendship_user_one_id,
          friendship_user_two_id,
          friendship_created_at
        from public.friendships f
        where least(f.user_one_id, f.user_two_id) = normalized_user_one
          and greatest(f.user_one_id, f.user_two_id) = normalized_user_two
        limit 1;
    end;
  else
    friendship_id := null;
    friendship_user_one_id := null;
    friendship_user_two_id := null;
    friendship_created_at := null;
  end if;

  update public.friend_requests
  set status = case when normalized_action = 'accept' then 'accepted' else 'rejected' end
  where public.friend_requests.id = req.id
    and public.friend_requests.receiver_id = acting_user_id
    and public.friend_requests.status = 'pending'
  returning * into updated_req;

  id := updated_req.id;
  sender_id := updated_req.sender_id;
  receiver_id := updated_req.receiver_id;
  sender_display_name := null;
  status := updated_req.status;
  created_at := updated_req.created_at;
  updated_at := updated_req.updated_at;

  return next;
end;
$$;

revoke all on function public.respond_to_friend_request(uuid, text) from public;
grant execute on function public.respond_to_friend_request(uuid, text) to authenticated;
