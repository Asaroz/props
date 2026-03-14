-- Issue 8: SECURITY DEFINER trigger that creates notification rows when
-- friend_requests are inserted or their status changes.
-- Runs as the database owner so it bypasses the RLS insert restriction
-- on the notifications table.

create or replace function public.create_friendship_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- New request sent: notify the receiver.
  if (TG_OP = 'INSERT') then
    insert into public.notifications (user_id, type, related_id, actor_id)
    values (NEW.receiver_id, 'friend_request_received', NEW.id, NEW.sender_id);
    return NEW;
  end if;

  -- Status changed: fire the relevant notification for the other party.
  if (TG_OP = 'UPDATE' and NEW.status <> OLD.status) then
    if NEW.status = 'accepted' then
      -- Notify the original sender that their request was accepted.
      insert into public.notifications (user_id, type, related_id, actor_id)
      values (NEW.sender_id, 'friend_request_accepted', NEW.id, NEW.receiver_id);
    elsif NEW.status = 'rejected' then
      -- Notify the original sender that their request was rejected.
      insert into public.notifications (user_id, type, related_id, actor_id)
      values (NEW.sender_id, 'friend_request_rejected', NEW.id, NEW.receiver_id);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists friend_requests_notify on public.friend_requests;
create trigger friend_requests_notify
after insert or update on public.friend_requests
for each row
execute function public.create_friendship_notification();
