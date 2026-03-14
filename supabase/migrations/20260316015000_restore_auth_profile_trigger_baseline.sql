-- Restore auth->profiles trigger function to baseline implementation.
-- The hardened version introduced in 20260316014000 correlated with persistent
-- auth user creation failures (unexpected_failure). Reverting to known baseline.

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
