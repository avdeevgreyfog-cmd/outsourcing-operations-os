# Organization Core

Organization Core is the canonical company structure and authorization foundation.

## Domain model

- `organizations` stores the company and organization-level settings.
- `legal_entities` stores one or more legal entities.
- `organization_units` stores a mutable hierarchy of departments, regions, branches, directions, teams and project groups.
- `positions` stores reusable job profiles: purpose, duties, responsibilities and process participation. The table name is retained for migration compatibility.
- `staff_positions` stores concrete budgeted seats, capacity, hierarchy, open/filled state and effective dates.
- `position_assignments` links employees to seats as primary, additional or acting assignments with FTE and effective dates.
- `process_roles` stores functional roles independent of a person's primary position.
- `organization_memberships` remains the corporate employee identity inside a tenant. It is separate from outsourced workers.
- `membership_organization_units`, `organization_unit_leads` and `membership_process_roles` support multiple structural and functional assignments.
- `organization_change_sets` and `organization_change_items` stage atomic, effective-dated reorganizations with impact payloads.
- `responsibility_rules` resolve process owners, executors, approvers, observers and fallbacks by role, seat, unit or employee.
- `position_permission_grants` and `process_role_permission_grants` feed effective access.
- `user_permission_overrides` remains the final employee-level allow/deny exception.

## Effective access

The server merges grants in this order:

1. legacy role template grants;
2. job-profile grants (legacy table `positions`);
3. all assigned process-role grants;
4. individual overrides.

An individual override replaces inherited treatment for that capability; explicit deny wins. Every scope stays capability-specific. Tenant isolation remains enforced by PostgreSQL RLS and server checks.

## Routes

- `/organization/structure` — interactive organization chart and company overview.
- `/organization/staff` — searchable employee directory.
- `/organization/positions` — positions and process roles.
- `/organization/departments` — organizational units, regions and templates.

Mutation endpoints require `organization.manage`, `organization.unit.manage`, `organization.position.manage`, `organization.employee.manage`, `organization.access.manage` or `admin.permissions.manage` as appropriate. Demo mode is read-only.

## Compatibility and migration

The module does not replace users, sessions, outsourced workers, teams, regions or legacy role templates. Existing installations can introduce staff positions and effective-dated assignments gradually. Business modules should reference stable organization-unit, staff-position or process-role identifiers and must not encode fixed department names.

## Invariants

- Job profile, staff position, employee assignment, process role and capability are different concepts.
- A staff position survives employee departure and can have capacity greater than one.
- An employee can have one primary and several additional or acting assignments.
- Organization hierarchy, position hierarchy, direct manager and responsibility routing are separate relations.
- Significant future changes are staged as a change set; records are archived or ended, not hard-deleted.
- Individual access exceptions must have a reason and may have effective dates and an approver.

## Production hardening (migration 0007)

- Cross-tenant references for staff positions, assignments and process roles are rejected in PostgreSQL in addition to RLS.
- Active assignment intervals are validated under a row lock: one primary assignment cannot overlap another, staff-position capacity cannot be exceeded, and total employee allocation cannot exceed `1 FTE` unless `allow_overallocation` is explicitly stored.
- Ending an assignment records the business reason, author and timestamp; audit triggers retain the before/after payload.
- `resolve_organization_responsibility(...)` is the stable database resolver entry point for workflow and task modules.
- Organization-unit taxonomy includes object teams and a neutral extension type without hard-coding one outsourcing model.

## Mutation API

- `POST/PATCH /api/organization/assignments` creates dated primary/additional/acting assignments and releases positions.
- `POST/PATCH /api/organization/change-sets` creates packages and enforces lifecycle transitions. Applying supported unit changes is executed inside one tenant transaction and is idempotent at the lifecycle level.
- `GET /api/organization/employees/:id/access` explains capability source, effect and scope.
- `GET /api/organization/history` exposes the unified audited history for an allow-listed Organization Core entity type.
