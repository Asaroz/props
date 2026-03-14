# Security and RLS Review (Issue 5)

Date: 2026-03-14

## Scope

- Tables: `profiles`, `friend_requests`, `friendships`, `props_entries`
- Focus: least-privilege write paths and bypass-resistant checks

## Findings

1. `props_entries` insert policy alone (`auth.uid() = from_user_id`) was not enough.
- Risk: an authenticated user could insert props to arbitrary `to_user_id` if calling DB directly.
- Impact: friendship requirement only existed in service code, not in DB rules.

## Remediation

- Added migration: `20260315004000_props_entries_require_friendship.sql`
- Adds trigger function `enforce_props_entry_friendship()`
- Enforces active friendship for every `props_entries` insert at DB level.

## Verification plan (low load)

- Positive path: `node scripts/smoke/test-props.js`
- Negative path (manual SQL/client): attempt insert without friendship should fail with `props entries require an active friendship`.

## Residual risks

- Service-role scripts can bypass RLS intentionally. Keep service-role usage restricted to controlled scripts only.
- Add an explicit negative smoke test for unauthorized props insert in a future small test extension.
