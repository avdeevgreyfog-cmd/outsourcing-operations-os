# Phase 2 architecture

## Boundary

The existing PostgreSQL and server authorization backbone remains authoritative. Phase 2 adds read models, workspaces and mutation surfaces without creating a parallel data store.

## Layers

1. **PostgreSQL domain layer** — normalized entities, effective-dated rules/rates, immutable scenario snapshots and canonical TimeEntry.
2. **Tenant boundary** — transaction-local `app.organization_id` and forced RLS.
3. **Authorization layer** — role grants, individual overrides, capability-specific scopes and field capabilities.
4. **Server data services** — only allowed fields are selected; rows are filtered before crossing the RSC boundary.
5. **Workspace read models** — entity-specific projections for tables, scheduler, tabs and analytics.
6. **Client interaction components** — navigation state, filters, drawers, period switches and exports. They do not persist business records locally.

## Phase 2 domain additions

- `launch_tasks` and `launch_task_dependencies` provide WBS, baseline, forecast, dependencies, milestones and critical-path attributes.
- `incidents` links operational exceptions to object, worker and shift.
- RLS and audit triggers cover these new high-risk entities.

## Entity routing

- `/clients/[id]?tab=...`
- `/requests/[id]`
- `/objects/[id]?tab=...`
- `/candidates/[id]`
- `/workers/[id]?tab=...`

Query-addressable tabs make operational contexts deep-linkable while keeping the primary sidebar compact.

## Canonical facts

- TimeEntry remains the only factual time layer.
- Client and internal timesheets are projections, not independent sources.
- Accruals reference timesheet snapshots.
- Client rates reference accepted calculation scenarios.
- P&L uses client revenue, worker accruals and direct object expenses.

## Mutation rule

Every production mutation must:

1. resolve server session;
2. require an action capability;
3. load target row context;
4. evaluate capability-specific scope;
5. execute inside tenant transaction;
6. write audit/business activity where required;
7. return only permitted fields.
