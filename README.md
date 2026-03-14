# Props

Props is a mobile social app prototype built with React Native (Expo) and a Supabase-backed service layer.

The repository is organized for incremental delivery: UI remains decoupled from backend providers, migrations are versioned, and low-load smoke tests are available for fast validation.

## Project Scope

- Mobile app prototype with Expo
- Auth, profile, and friendship domain services
- Supabase database schema + migration history
- Local MCP tooling for Copilot-assisted repo workflows

## Tech Stack

- React Native + Expo
- React
- Supabase (`@supabase/supabase-js`)
- Node.js scripts for smoke tests and local tooling
- Model Context Protocol SDK for local MCP server

## Repository Layout

- `App.js`: Expo entry point
- `src/screens`: app screens
- `src/components`: reusable UI components
- `src/backend`: config, client, auth/session, service layer
- `scripts/smoke`: small smoke tests (auth, profile, friendship, props)
- `supabase/migrations`: ordered SQL migrations
- `tools/mcp`: local MCP server implementation
- `docs/adr`: architecture decisions
- `docs/backend`: backend conventions and setup docs

## Prerequisites

- Node.js LTS
- npm
- Expo Go (optional, for device testing)
- Supabase project (for real backend mode)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

3. Set at least:

- `EXPO_PUBLIC_BACKEND_PROVIDER=supabase`
- `EXPO_PUBLIC_SUPABASE_URL=...`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...` (required for some smoke paths)
- `EXPO_PUBLIC_AUTH_REDIRECT_URL=...` (recommended)

4. Start app:

```bash
npm run start
```

## Runtime Commands

- `npm run start`: Expo dev server
- `npm run android`: run on Android target
- `npm run ios`: run on iOS target
- `npm run web`: run web target
- `npx expo start --tunnel -c`: fallback when LAN connectivity is unstable

## Testing Commands

- `npm run smoke:test`: full smoke runner
- `npm run smoke:auth`: auth-focused smoke checks
- `npm run smoke:profile`: profile-focused smoke checks
- `npm run smoke:friendship`: friendship flow checks
- `npm run smoke:friendship:mini`: minimal friendship checks
- `npm run smoke:props`: props-domain checks

The smoke suite is split into small tests and designed for low backend load.

## Database and Migrations

- SQL migrations are stored in `supabase/migrations`
- Apply with Supabase CLI when linked:

```bash
npx supabase db push
```

- If needed, run initial SQL manually in Supabase SQL Editor

## Local MCP Tooling

This repository includes a local MCP server for VS Code + Copilot.

- Start manually:

```bash
npm run mcp:props
```

- Server file: `tools/mcp/props-local-server.mjs`
- Expected config entry: `.vscode/mcp.json`
- Exposed tools:
	- `project_summary`
	- `list_smoke_commands`
	- `list_repo_docs`
	- `read_repo_doc`
	- `openviking_search` *(optional, requires `OPENVIKING_BASE_URL`)*
	- `openviking_read` *(optional, requires `OPENVIKING_BASE_URL`)*

## OpenViking (local context search)

Semantic search over repo docs, migrations, services, and smoke scripts via a local Ollama-backed index.

- **Requires:** Python 3.12 venv at `.venv-openviking312`, Ollama running

Start services:

```powershell
# 1. Ollama (if not already running)
Start-Process ollama -ArgumentList serve

# 2. OpenViking server
.\.venv-openviking312\Scripts\openviking-server --config "$HOME/.openviking/ov.conf" --host 127.0.0.1 --port 1933
```

Then set `OPENVIKING_BASE_URL=http://127.0.0.1:1933` in your MCP environment to enable the tools.

## Git Standards

Use a clean, reviewable workflow aligned with common Git team practices.

1. Branch naming

- `feat/<short-topic>`
- `fix/<short-topic>`
- `chore/<short-topic>`
- `docs/<short-topic>`

2. Commit style (Conventional Commits)

- `feat(auth): add signup validation`
- `fix(friendship): prevent duplicate request submit`
- `docs(readme): restructure setup section`

3. Commit quality

- Keep one concern per commit
- Avoid mixing refactor + behavior change unless required
- Include migration and service changes in the same branch when they are logically coupled

4. Pull request quality

- Rebase on latest main before opening/merging
- Include a short test note (what you ran, what passed)
- Attach screenshots for UI changes
- Keep PR scope focused and small when possible

5. Merge policy

- Prefer squash merge for clean history
- Ensure CI and smoke checks relevant to the change are green

## Additional Documentation

- `docs/adr/0001-backend-platform.md`
- `docs/backend/environment-strategy.md`
- `docs/backend/naming-conventions.md`
- `docs/backend/mcp-usecases.md`
