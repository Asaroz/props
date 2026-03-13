create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  safe_username text;
  fallback_username text;
  display_name_value text;
begin
  base_username := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1), 'user');
  safe_username := lower(regexp_replace(base_username, '[^a-z0-9_]+', '', 'g'));
  if safe_username = '' then
    safe_username := 'user';
  end if;

  fallback_username := safe_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  display_name_value := coalesce(
    nullif(trim(new.raw_user_meta_data->>'displayName'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    safe_username
  );

  insert into public.profiles (
    id,
    email,
    username,
    display_name,
    bio,
    avatar_url,
    city
  )
  values (
    new.id,
    new.email,
    fallback_username,
    display_name_value,
    '',
    '',
    coalesce(nullif(trim(new.raw_user_meta_data->>'city'), ''), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        city = excluded.city,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();

insert into public.profiles (
  id,
  email,
  username,
  display_name,
  bio,
  avatar_url,
  city
)
select
  u.id,
  u.email,
  (
    lower(regexp_replace(coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1), 'user'), '[^a-z0-9_]+', '', 'g'))
    || '_' || substr(replace(u.id::text, '-', ''), 1, 6)
  ) as username,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'displayName'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1)
  ) as display_name,
  '' as bio,
  '' as avatar_url,
  coalesce(nullif(trim(u.raw_user_meta_data->>'city'), ''), '') as city
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
