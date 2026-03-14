-- Migration: group_vouching_rules
-- Hardens group vouching by enforcing linked-group membership and a daily per-user limit.

create index if not exists prop_vouches_user_created_at_idx
  on public.prop_vouches (user_id, created_at);

create or replace function public.enforce_vouch_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_user_id uuid;
  v_to_user_id uuid;
  v_daily_limit int := coalesce(nullif(current_setting('app.vouch_daily_limit', true), '')::int, 10);
  v_day_start_utc timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_day_end_utc timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '1 day';
  v_today_count int;
begin
  -- Ignore user-provided created_at to avoid quota bypassing.
  new.created_at := now();

  select from_user_id, to_user_id
  into v_from_user_id, v_to_user_id
  from public.props_entries
  where id = new.prop_id;

  if not found then
    raise exception 'props entry not found for vouch';
  end if;

  -- Direct participants may not vouch their own prop.
  if new.user_id = v_from_user_id or new.user_id = v_to_user_id then
    raise exception 'direct participants cannot vouch their own prop';
  end if;

  -- Voucher must be friend of the from_user.
  if not exists (
    select 1
    from public.friendships f
    where (f.user_one_id = new.user_id and f.user_two_id = v_from_user_id)
       or (f.user_one_id = v_from_user_id and f.user_two_id = new.user_id)
  ) then
    raise exception 'voucher must be a friend of the props sender';
  end if;

  -- Voucher must be friend of the to_user.
  if not exists (
    select 1
    from public.friendships f
    where (f.user_one_id = new.user_id and f.user_two_id = v_to_user_id)
       or (f.user_one_id = v_to_user_id and f.user_two_id = new.user_id)
  ) then
    raise exception 'voucher must be a friend of the props receiver';
  end if;

  -- For group-linked props, the voucher must be a member of every linked group.
  if exists (
    select 1
    from public.group_props_links gpl
    where gpl.prop_id = new.prop_id
      and not public.is_group_member(gpl.group_id, new.user_id)
  ) then
    raise exception 'voucher must be a member of all linked groups';
  end if;

  -- Serialize daily quota checks per user/day to avoid concurrent bypasses.
  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), 0)
  );

  select count(*)
  into v_today_count
  from public.prop_vouches pv
  where pv.user_id = new.user_id
    and pv.created_at >= v_day_start_utc
    and pv.created_at < v_day_end_utc;

  if v_today_count >= v_daily_limit then
    raise exception 'daily vouch limit reached';
  end if;

  return new;
end;
$$;