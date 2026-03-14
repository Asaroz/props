create index if not exists friendships_user_one_created_at_idx
  on public.friendships (user_one_id, created_at desc);

create index if not exists friendships_user_two_created_at_idx
  on public.friendships (user_two_id, created_at desc);

create index if not exists friend_requests_receiver_status_created_at_idx
  on public.friend_requests (receiver_id, status, created_at desc);