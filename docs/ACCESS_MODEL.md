# Access model

Effective business access is evaluated per capability:

`Legacy role template (compatibility) + job-profile grants + process-role grants + individual overrides + capability scope + field capability`.

System administration is evaluated separately:

`Organization owner + delegated membership system grants`.

The owner is a system relationship with an organization, not a job title. A purchaser can therefore be the organization owner while holding any job position in the company structure. Delegated administrators receive only the system capabilities explicitly assigned to their membership.

Within the business-access layer, explicit deny wins. Owner and delegated system grants are applied after business inheritance and cannot be removed by a job-profile deny.

## Scope types

- `all_org`
- `self`
- `region` with selected region IDs, or the employee's assigned regions
- `org_unit` with selected unit IDs, or the employee's assigned units
- `org_unit_subtree` with a unit and all of its descendants; empty IDs resolve from the employee's assigned units
- `team`
- `assigned_to_me`
- `own_created`
- `objects` with selected object IDs
- `clients` with selected client IDs

The same user can have different scopes for different capabilities. An organization-wide calculation permission does not widen worker or finance access.

`org_unit_subtree` is resolved on the server against the current organization hierarchy before row checks. Moving a team under another unit therefore changes future effective scope without rewriting every employee grant.

## Job access versus system administration

Job profiles and process roles describe work. They can grant business capabilities and data scopes.

System capabilities are deliberately not assigned through job profiles, process roles or individual business overrides. They cover administration such as:

- organization settings;
- structure and departments;
- positions and process roles;
- employee invitations and account administration;
- inherited access configuration;
- individual access exceptions;
- audit log access;
- delegation of system administrators.

`admin.system_access.manage` is owner-controlled. A delegated administrator cannot use the ordinary access editor to elevate their own system permissions.

New employees receive the deterministic compatibility role template `member`. It contains only the minimal application baseline; business access should come from their assigned job profile and process roles.

## Sensitive fields

Separate capabilities protect:

- worker compensation;
- accruals;
- payments;
- client margin/P&L;
- personal documents.

Sensitive columns are omitted or selected as `NULL` on the server when permission is absent. A non-owner cannot create an individual sensitive-data allowance they do not themselves possess.

## Organizational inheritance

A position answers who an employee is in the company structure. A concrete staff position answers where that job exists and who it reports to. Process roles answer which additional functions the employee performs. These concepts remain independent.

Existing `role_templates` remain a compatibility layer while installations migrate to explicit positions and process roles. They must not be used as the primary model for new employee access.

## Individual override editor

The editor writes to `user_permission_overrides`. The API verifies the administrator capability and target membership inside the same organization. `inherit` removes the override; `allow` stores scope; `deny` overrides inherited business access.

Individual exceptions are for exceptional cases. Normal recurring access should be configured on the job profile or process role.

## UX versus security

Sidebar and tabs hide unavailable destinations for clarity. They are not security boundaries. Services and mutations must still enforce capability, scope, field restrictions and PostgreSQL RLS.

The access UI separates:

1. system administration for a membership;
2. inherited job/process access;
3. individual exceptions.

Job-profile access exposes both an allow/deny state and a data scope. Raw capability codes remain implementation details; Russian descriptions are the primary UI labels.

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
excludes the administrator's owner/system grants, position grants, process-role grants and individual
overrides that do not belong to the selected preview subject, so elevated rights do not leak into the tested subject.
