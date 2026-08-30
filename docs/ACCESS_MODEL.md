# Access model

Effective access is evaluated per capability:

`Role template grants + individual overrides + capability scope + field capability`.

Explicit deny wins.

## Scope types

- `all_org`
- `region` with selected region IDs
- `team`
- `assigned_to_me`
- `own_created`
- `objects` with selected object IDs
- `clients` with selected client IDs

The same user can have different scopes for different capabilities. An organization-wide calculation permission does not widen worker or finance access.

## Sensitive fields

Separate capabilities protect:

- worker compensation;
- accruals;
- payments;
- client margin/P&L;
- personal documents.

Sensitive columns are omitted or selected as `NULL` on the server when permission is absent.

## Individual override editor

The Phase 2 editor writes to `user_permission_overrides`. The API verifies the administrator capability and target membership inside the same organization. `inherit` removes the override; `allow` stores scope; `deny` overrides inherited allow.

## UX versus security

Sidebar and tabs hide unavailable destinations for clarity. They are not security boundaries. Services and mutations must still enforce capability, scope, field restrictions and PostgreSQL RLS.
