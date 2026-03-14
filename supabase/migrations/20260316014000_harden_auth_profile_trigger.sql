-- Stabilize auth user creation by hardening the auth->profiles trigger.
-- Goal: avoid brittle failures from rare username collisions in profile insert path.

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  safe_username text;
  candidate_username text;
  display_name_value text;
  attempt_count integer := 0;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1),
    'user'
  );

  safe_username := lower(regexp_replace(base_username, '[^a-z0-9_]+', '', 'g'));
  if safe_username = '' then
    safe_username := 'user';
  end if;

  display_name_value := coalesce(
    nullif(trim(new.raw_user_meta_data->>'displayName'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    safe_username
  );

  candidate_username := left(safe_username, 40) || '_' || substr(replace(new.id::text, '-', ''), 1, 12);

  loop
    begin
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
        candidate_username,
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
    exception
      when unique_violation then
        attempt_count := attempt_count + 1;
        if attempt_count >= 6 then
          raise exception 'profile upsert failed after % attempts for auth user %', attempt_count, new.id;
        end if;

        candidate_username := left(safe_username, 40) || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    end;
  end loop;
end;
$$;
