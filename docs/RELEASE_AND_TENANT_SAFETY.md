# OPERIS release model

## Environments

OPERIS uses one shared application codebase and isolated tenant data.

- `beta`: pre-production validation branch. Use a separate staging deployment and a separate staging database.
- `main`: production release branch. Production customer organizations remain isolated by PostgreSQL RLS.

Never use a production customer organization as a staging dataset.

## Normal release flow

1. Implement and validate changes on `beta`.
2. Run CI, database integration tests and tenant-isolation checks.
3. Validate the staging deployment against the staging database.
4. Merge the reviewed release from `beta` to `main`.
5. Build/deploy the application.
6. Run database migrations as an explicit protected release step when the release contains pending migrations.
7. Run production smoke checks.

Application builds are intentionally side-effect free and never execute migrations.

## Database migrations

Safe additive schema migrations can be released through the protected `Production Database Release` GitHub workflow.

Destructive SQL is fail-closed:

- `ALLOW_DESTRUCTIVE_MIGRATION=1` is required for any destructive migration.
- If persistent customer workspaces exist, `ALLOW_PROTECTED_TENANT_DESTRUCTIVE_MIGRATION=1` is additionally required.
- These flags are not routine settings. They are emergency/review gates and should only be used after backup and explicit review.

The workflow expects `PRODUCTION_DATABASE_URL` to be configured as a secret on the protected GitHub `production` environment.

## Tenant isolation invariant

All business tables carrying `organization_id` must:

- have PostgreSQL RLS enabled;
- expose at least one tenant policy;
- enforce `organization_id = app_current_organization_id()`;
- reject cross-tenant writes;
- avoid cross-tenant foreign references.

A user may belong to several organizations through separate active memberships. Switching organizations must never broaden the current tenant context beyond the selected membership.

## Required infrastructure before onboarding external customers

- separate staging database;
- staging deployment connected only to staging database;
- protected GitHub `production` environment;
- `PRODUCTION_DATABASE_URL` secret;
- database backups before destructive releases;
- staging URL smoke checks for `beta`;
- production smoke checks after `main` deployment.
