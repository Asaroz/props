# Environment Strategy

## Targets

- local: developer machine
- dev: shared testing environment
- prod: production environment

## Variables

Required for Supabase mode:

- EXPO_PUBLIC_BACKEND_PROVIDER
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

## Local

- Use `.env` (copied from `.env.example`).
- Keep `.env` out of git.

## Dev/Prod

- Set environment variables in the deployment platform.
- Do not store secrets in repository files.
- Keep key names stable across environments.

## Provider Toggle

- `EXPO_PUBLIC_BACKEND_PROVIDER=mock` keeps local mock flows active.
- `EXPO_PUBLIC_BACKEND_PROVIDER=supabase` enables real backend path once client integration is completed.
