-- Temporarily disable auth->profiles trigger to diagnose persistent
-- auth admin.createUser failures (unexpected_failure / database error creating new user).
-- Profile rows can be ensured at application/service level.

drop trigger if exists on_auth_user_created_create_profile on auth.users;
