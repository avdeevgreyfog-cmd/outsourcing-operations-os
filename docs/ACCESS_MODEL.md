# Access model

Effective access is evaluated per capability:

`Legacy role template + position grants + process role grants + individual overrides + capability scope + field capability`.

Explicit deny wins.

## Scope types

- `all_org`
- `self`
- `region` with selected region IDs
- `org_unit` with selected unit IDs, or the employee's assigned units
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

## Organizational inheritance

A position answers who an employee is in the company structure. Process roles answer which functions that employee performs. Both can grant capabilities, and an employee can hold several process roles. Existing `role_templates` remain a compatibility layer while installations migrate to explicit positions and process roles.

## Individual override editor

The editor writes to `user_permission_overrides`. The API verifies the administrator capability and target membership inside the same organization. `inherit` removes the override; `allow` stores scope; `deny` overrides inherited allow.

## UX versus security

Sidebar and tabs hide unavailable destinations for clarity. They are not security boundaries. Services and mutations must still enforce capability, scope, field restrictions and PostgreSQL RLS.


## Tenant workspaces and access preview

The same application can expose two workspace kinds without branching the product code:

- a synthetic, read-only **Демо-организация** for evaluation and visual testing;
- database-backed tenant organizations containing real operational records.

A valid database session is no longer replaced merely because demo mode is enabled.
The explicit workspace cookie selects the synthetic demo; clearing it returns to the
authenticated tenant. Business rows in the working tenant remain PostgreSQL/RLS scoped
by `organization_id`.

Administrators can use **Режим проверки** to evaluate the interface with another access
subject. Supported subjects are role templates, job-position profiles and process roles.
The preview capability set is evaluated on the server and therefore affects navigation,
direct-route authorization and mutation capability checks. It does not change the signed-in
user identity, membership, audit actor or persisted assignment. The preview intentionally
excludes the administrator's own position grants, process-role grants and individual
overrides so elevated rights do not leak into the tested subject.
