create or replace function public.list_incoming_friend_requests_with_sender(input_user_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  sender_display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    fr.id,
    fr.sender_id,
    fr.receiver_id,
    fr.status,
    fr.created_at,
    fr.updated_at,
    sp.display_name as sender_display_name
  from public.friend_requests fr
  join public.profiles sp on sp.id = fr.sender_id
  where fr.receiver_id = input_user_id
    and fr.status = 'pending'
    and auth.uid() = input_user_id
  order by fr.created_at desc;
$$;

revoke all on function public.list_incoming_friend_requests_with_sender(uuid) from public;
grant execute on function public.list_incoming_friend_requests_with_sender(uuid) to authenticated;
