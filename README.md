# Props

Props is a mobile social media app prototype built with React Native and Expo.

Current scope:
- Basic app shell and folder structure
- Home feed screen with mock friend data
- Placeholder cards for upcoming features (profiles, interactions)

## Tech Stack

- Expo
- React Native
- React

## Project Structure

- App.js: App entry point
- docs/adr: Architecture Decision Records
- docs/backend: Backend conventions and planning docs
- src/navigation: Navigation placeholder
- src/screens: Screen components
- src/components: Reusable UI components
- src/data: Mock data
- src/backend/config: Backend environment/config helpers
- src/backend/client: Backend client factories
- src/backend/services: App service layer (UI -> service -> backend)
- src/theme: Color/theme tokens

## Prerequisites

- Node.js (LTS recommended)
- npm
- Expo Go app on your phone (optional for device testing)

## Install

Run once after cloning or first setup:

```bash
npm install
```

## Start the App

Default start:

```bash
npm run start
```

Start for Android emulator/device:

```bash
npm run android
```

Start for iOS simulator/device:

```bash
npm run ios
```

Start for web:

```bash
npm run web
```

## Recommended Mobile Start Mode

If device connection is unstable, use tunnel mode:

```bash
npx expo start --tunnel -c
```

## Backend Foundation (Issue 1)

Current backend direction: Supabase (with a service boundary in app code).

Architecture docs:
- docs/adr/0001-backend-platform.md
- docs/backend/naming-conventions.md
- docs/backend/environment-strategy.md

### Environment Setup

1. Copy the template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Fill these values in `.env`:

- EXPO_PUBLIC_BACKEND_PROVIDER=supabase
- EXPO_PUBLIC_SUPABASE_URL=...
- EXPO_PUBLIC_SUPABASE_ANON_KEY=...
- EXPO_PUBLIC_AUTH_REDIRECT_URL=... (optional, recommended for email confirmation)

3. Restart Expo after env changes:

```bash
npx expo start -c
```

### Service Layer Rule

Screens/components should call functions from `src/backend/services` instead of importing backend provider logic directly. This keeps migration from mock to real backend simple.

Current foundation status:
- Supabase SDK is installed and a client factory exists in `src/backend/client/supabaseClient.js`.
- Auth service supports provider switch:
	- `mock` mode: username/email + password from local JSON
	- `supabase` mode: email + password via Supabase auth
- Friendship service is implemented against Supabase tables (`friend_requests`, `friendships`).
- Props service is still a stub for upcoming implementation.

### Backend Smoke Test Suite (Auth/Profile/Friendship)

Run the smoke suite:

```bash
npm run smoke:test
```

The suite is intentionally split into multiple small checks and reuses the same two created users across all checks to keep free-tier load low.

What it validates:
- sign up user A
- sign up user B
- login success (A and B)
- login failure with wrong password
- profile read (own profile)
- profile update (city, bio)
- friend request reject flow (B -> A)
- friend request pending + duplicate prevention (A -> B)
- friend request accept flow
- friendship list visibility for both users
- logout for both users

Cleanup behavior:
- all auth users created during the run are deleted in a `finally` block
- related `profiles`, `friend_requests`, and `friendships` rows are removed via DB cascades

Rate-limit and free-tier behavior:
- if auth sign-up rate limits are hit, the suite falls back to admin provisioning for deterministic runs
- expected request volume per run is low

Required `.env` values:
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

### Apply the Initial Supabase Schema

Remote schema creation cannot be done with the public anon key alone. Use the Supabase dashboard SQL Editor for the first migration.

1. Open your Supabase project.
2. Go to SQL Editor.
3. Copy the contents of `supabase/migrations/20260313000001_init_props_schema.sql`.
4. Run the SQL once.

After that, the first real profile read/write service is available in:
- `src/backend/services/profileService.js`

### Ensure Profiles Are Created Automatically

Migration `supabase/migrations/20260313220000_profiles_on_auth_signup.sql` adds:
- a DB trigger on `auth.users` to create/update `public.profiles` automatically
- a backfill for existing auth users that still miss a profile row

Apply migrations with Supabase CLI:

```bash
npx supabase db push
```

### Create the First Real User

When `EXPO_PUBLIC_BACKEND_PROVIDER=supabase` and the env values are set, the login screen starts in sign-up mode.

Use the frontend form to enter:
- email
- display name
- username
- city
- password

On successful sign-up:
- a Supabase auth user is created
- a first `profiles` row is created automatically when a session is returned
- if email confirmation is required, the profile row is created on first successful login after confirmation

Auth UX improvements currently included:
- sign-up password confirmation
- password show/hide toggle
- smoother animated switch between sign-up and login
- session persist + restore on app launch
- logout routed through central auth service (mock + supabase)

If confirmation emails still open `localhost`, set both of these:
- `EXPO_PUBLIC_AUTH_REDIRECT_URL` in your local `.env`
- Supabase Dashboard -> Authentication -> URL Configuration -> Site URL / Redirect URLs

Login behavior by provider:
- `supabase`: login requires email + password (real backend auth)
- `mock`: login supports demo username/email + password from `src/backend/mock/accounts.json`

## Expo Account Commands

Login with your Expo account:

```bash
npx expo login
```

Check current login user:

```bash
npx expo whoami
```

Logout:

```bash
npx expo logout
```

## Troubleshooting

### npm is not recognized

- Reinstall Node.js with Add to PATH enabled
- Restart VS Code/terminal
- Verify with:

```bash
node -v
npm -v
```

### Expo Go shows network/offline error

- Try tunnel mode: npx expo start --tunnel -c
- Ensure phone and computer are on the same network (or use tunnel)
- Disable VPN/ad blockers temporarily
- Check firewall permissions for Node.js and Expo

## Next Planned Features

- User profiles
- Give/receive props interactions
- Real navigation tabs
- Backend/API integration (Supabase foundation in progress)
