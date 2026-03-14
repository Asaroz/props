-- Allow FK cascade behavior for notifications.actor_id when auth users are deleted.
-- Keep notification rows immutable for application writes, except:
-- - read_at updates
-- - actor_id transition from value -> null during FK on delete set null

create or replace function public.enforce_notifications_read_only_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.related_id is distinct from old.related_id
     or new.created_at is distinct from old.created_at then
    raise exception 'only read_at can be updated for notifications';
  end if;

  if new.actor_id is distinct from old.actor_id then
    if not (old.actor_id is not null and new.actor_id is null and new.read_at is not distinct from old.read_at) then
      raise exception 'actor_id is immutable except fk cleanup to null';
    end if;
  end if;

  return new;
end;
$$;
