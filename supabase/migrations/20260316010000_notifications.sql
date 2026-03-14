-- Issue 8: In-app notification center for friendship events.
-- Creates the notifications table with RLS.
-- Inserts are intentionally blocked for authenticated users —
-- all rows are created by the SECURITY DEFINER trigger defined in the next migration.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in (
               'friend_request_received',
               'friend_request_accepted',
               'friend_request_rejected'
             )),
  related_id uuid null,
  actor_id   uuid null references auth.users(id) on delete set null,
  read_at    timestamptz null,
  created_at timestamptz not null default now()
);

-- Fast unread-count and ordered list queries.
create index if not exists notifications_user_id_read_at_idx
  on public.notifications (user_id, read_at);

-- RLS
alter table public.notifications enable row level security;

-- Users may only read their own notifications.
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users may only update their own notifications (to set read_at).
-- INSERT and DELETE are handled exclusively by the trigger function.
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
