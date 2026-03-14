with ranked_profiles as (
  select
    p.id,
    p.display_name,
    row_number() over (
      partition by lower(p.display_name)
      order by p.created_at asc, p.id asc
    ) as rn
  from public.profiles p
)
update public.profiles p
set display_name = p.display_name || '-' || substr(p.id::text, 1, 8)
from ranked_profiles rp
where p.id = rp.id
  and rp.rn > 1;

create unique index if not exists profiles_display_name_unique_idx
  on public.profiles (lower(display_name));

create or replace function public.find_profile_by_display_name(input_display_name text)
returns table (id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where lower(p.display_name) = lower(trim(input_display_name))
  order by p.created_at asc, p.id asc;
$$;

revoke all on function public.find_profile_by_display_name(text) from public;
grant execute on function public.find_profile_by_display_name(text) to authenticated;
