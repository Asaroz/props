# MVP Launch Checklist (Issue 5)

## Goal

- Make go/no-go decisions reproducible for Security, Observability, and low-load validation.

## Scope

- In scope: security rules, observability baseline, smoke evidence, rollback notes.
- Out of scope: full performance testing, large-scale load testing.

## Gate 1: Security Sign-off

- [ ] RLS policies reviewed for affected tables (`profiles`, `friend_requests`, `friendships`, `props_entries`).
- [ ] `props_entries` insert path enforces friendship at DB level (not only service layer).
- [ ] Least-privilege check completed for read/write paths used by app services.
- [ ] Abuse-risk checklist reviewed for vouching prerequisites (duplicate actions, unauthorized calls).
- [ ] No critical findings open.

Evidence:
- Reviewer:
- Date:
- Source docs/migrations:
- Findings:

## Gate 2: Observability Sign-off

- [ ] Structured logs exist for auth, friendship, and props core flows.
- [ ] Error paths log machine-usable events (event name, code/message, duration).
- [ ] Sensitive fields are redacted (password/token/secret/api keys).
- [ ] Success and failure events validated in local run.

Evidence:
- Reviewer:
- Date:
- Verified events:
- Notes:

## Gate 3: Launch Dry-run

- [ ] Smoke plan uses minimal backend load and reuses existing test users.
- [ ] Issue-specific smoke tests executed (no unnecessary full-suite run).
- [ ] Known risks documented with owner and follow-up action.
- [ ] Rollback path documented and reachable.

Evidence:
- Reviewer:
- Date:
- Commands executed:
- Failures/Risks:

## Low-load smoke baseline

- `node scripts/smoke/test-auth.js`
- `node scripts/smoke/test-friendship-mini.js`
- `node scripts/smoke/test-props.js`

## Go/No-Go Decision

- Decision: GO / NO-GO
- Decider:
- Date:
- Blocking issues:
- Follow-up actions:
