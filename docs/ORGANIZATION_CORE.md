# Organization Core

Organization Core is the canonical company structure and authorization foundation.

## Domain model

- `organizations` stores the company and organization-level settings.
- `organization_legal_entities` stores one or more legal entities.
- `organization_units` stores a mutable hierarchy of departments, regions, branches, directions, teams and project groups.
- `positions` stores reusable job templates: purpose, duties, responsibilities and process participation.
- `process_roles` stores functional roles independent of a person's primary position.
- `organization_memberships` remains the employee identity inside a tenant and gains a primary position.
- `membership_organization_units` and `membership_process_roles` support multiple assignments.
- `position_permission_grants` and `process_role_permission_grants` feed effective access.
- `user_permission_overrides` remains the final employee-level allow/deny exception.

## Effective access

The server merges grants in this order:

1. legacy role template grants;
2. position grants;
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

The module does not replace users, sessions, teams, regions or legacy role templates. Existing installations can assign positions and process roles gradually. Business modules should reference stable organization-unit or role identifiers and must not encode fixed department names.
