-- Migration: groups_domain_model_v1
-- Introduces MVP group domain tables with enforced referential integrity.
-- groups.cover_image_url is intentionally nullable for groups without a cover image.

create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  cover_image_url text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.groups.cover_image_url is
  'Optional URL for group cover image. Nullable by design for groups without a cover image.';

create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz,
  check (inviter_id <> invitee_id),
  check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'rejected', 'canceled') and responded_at is not null)
  ),
  check (expires_at is null or expires_at > created_at)
);

create table if not exists public.group_props_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  prop_id uuid not null references public.props_entries (id) on delete cascade,
  linked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, prop_id)
);

create index if not exists group_memberships_user_group_idx
  on public.group_memberships (user_id, group_id);

create unique index if not exists group_memberships_single_owner_idx
  on public.group_memberships (group_id)
  where role = 'owner';

create unique index if not exists group_invites_pending_unique_idx
  on public.group_invites (group_id, invitee_id)
  where status = 'pending';

create index if not exists group_invites_invitee_status_created_idx
  on public.group_invites (invitee_id, status, created_at desc);

create index if not exists group_invites_group_status_created_idx
  on public.group_invites (group_id, status, created_at desc);

create index if not exists group_props_links_group_created_idx
  on public.group_props_links (group_id, created_at desc);

create index if not exists group_props_links_prop_idx
  on public.group_props_links (prop_id);

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
before update on public.groups
for each row
execute function public.set_updated_at();

drop trigger if exists group_memberships_set_updated_at on public.group_memberships;
create trigger group_memberships_set_updated_at
before update on public.group_memberships
for each row
execute function public.set_updated_at();
