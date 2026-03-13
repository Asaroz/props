create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  username text unique not null,
  display_name text not null,
  bio text default '' not null,
  avatar_url text,
  city text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (sender_id, receiver_id),
  check (sender_id <> receiver_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles (id) on delete cascade,
  user_two_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now() not null,
  check (user_one_id <> user_two_id)
);

create unique index if not exists friendships_pair_unique_idx
  on public.friendships (least(user_one_id, user_two_id), greatest(user_one_id, user_two_id));

create table if not exists public.props_entries (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  category text,
  created_at timestamptz default now() not null,
  check (from_user_id <> to_user_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.props_entries enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "friend_requests_manage_own" on public.friend_requests;
create policy "friend_requests_manage_own"
  on public.friend_requests
  for all
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id)
  with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "friendships_read_own" on public.friendships;
create policy "friendships_read_own"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
  on public.friendships
  for insert
  to authenticated
  with check (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "props_entries_read_related" on public.props_entries;
create policy "props_entries_read_related"
  on public.props_entries
  for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "props_entries_insert_from_self" on public.props_entries;
create policy "props_entries_insert_from_self"
  on public.props_entries
  for insert
  to authenticated
  with check (auth.uid() = from_user_id);
