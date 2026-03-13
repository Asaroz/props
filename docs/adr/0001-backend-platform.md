# ADR 0001: Backend Platform and Service Boundary

- Status: Accepted
- Date: 2026-03-13

## Context

Props is a small social app with low expected early traffic. We still need reliable authentication, relational data, and access control from day one to avoid expensive rewrites.

## Decision

Use Supabase as the primary backend platform for MVP.

Use a backend service layer in the app (`src/backend/services`) so UI screens do not call backend providers directly.

## Why Supabase

- Free tier is enough for low-volume MVP usage.
- PostgreSQL is a good fit for users, friendships, and props relations.
- Built-in auth for email/password.
- Row Level Security supports privacy rules as the app grows.
- Easy migration path to dedicated infrastructure later if needed.

## Consequences

- We keep mock data for early UI flows, but new backend work goes through services.
- Environment variables are required in local/dev/prod.
- Security rules (RLS) become a first-class part of feature delivery.

## Initial Scope

- Auth and profile baseline
- Friends graph baseline
- Props create/read baseline
- Security/logging checklist before release
