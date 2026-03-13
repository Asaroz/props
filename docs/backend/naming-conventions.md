# Backend Naming Conventions

## IDs

- Use string IDs for app-level entities.
- Preferred format in app models: `u_001`, `fr_001`, `pr_001` for mock/local data.
- In database tables, keep a stable primary key (`id`) and do not reuse IDs.

## Timestamps

- Store all timestamps in ISO-8601 UTC format.
- Field naming standard:
  - `createdAt`
  - `updatedAt`
  - Optional domain events like `acceptedAt`, `sentAt`

## Foreign Keys and References

- Use explicit relation names in app models:
  - `fromUserId`
  - `toUserId`
  - `ownerId`

## Status Fields

- Use lowercase enum-like strings for state values.
- Example for friend requests: `pending`, `accepted`, `rejected`.

## API/Service Naming

- Services use verb-first function names:
  - `loginWithPassword`
  - `getCurrentProfile`
  - `sendFriendRequest`
  - `createPropsEntry`
