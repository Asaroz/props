-- Issue 8 hardening: restrict notification mutability and tighten function execute surface.

-- Table privileges: authenticated users may only read notifications and update read_at.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create or replace function public.enforce_notifications_read_only_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.related_id is distinct from old.related_id
     or new.actor_id is distinct from old.actor_id
     or new.created_at is distinct from old.created_at then
    raise exception 'only read_at can be updated for notifications';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_read_only_update on public.notifications;
create trigger notifications_read_only_update
before update on public.notifications
for each row
execute function public.enforce_notifications_read_only_update();

-- Trigger function should only be usable through trigger execution.
revoke execute on function public.create_friendship_notification() from public, anon, authenticated;
