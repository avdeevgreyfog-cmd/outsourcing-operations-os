# Architecture decisions — first pass

## 1. New codebase, donor logic only

The target repository is intentionally not derived from `r-kadry-os`.

Preserved as business ideas:

- company/client → contacts → request → calculation → proposal;
- object and staffing need as linked post-sale operational context;
- recruiting funnel and candidate → worker conversion;
- launch / shift / attendance / timesheet workflow;
- grouped calculator expenses, scenario comparison, employee-level and project-level costs;
- object expenses, revenue, accruals and P&L lineage.

Rejected from legacy implementation:

- old product name and visual shell;
- monolithic standalone HTML architecture;
- localStorage as production persistence;
- fixed role-specific applications or duplicated databases;
- generic card-heavy dashboard styling and legacy sidebar/CSS.

## 2. One application shell, effective access

There is one product shell. Effective access is computed from:

`legacy role template grants + position grants + process role grants + individual allow/deny overrides + capability-specific data scope + field-sensitive permissions`.

Explicit deny wins. Scope is evaluated per capability; an `all_org` scope on one capability never widens another capability. This invariant has a regression test.

PostgreSQL RLS is used for the tenant/organization boundary. Fine-grained capability and row-scope authorization is enforced server-side before data leaves the server. Sensitive compensation fields are not selected/returned without `worker.compensation.read`.

## 3. Tenant context and sessions

Protected queries execute inside a transaction that sets:

- `app.organization_id`;
- `app.user_id`.

RLS policies compare tenant rows with `app.organization_id`.

The `sessions` table is intentionally not behind tenant RLS because the session must be resolved before the tenant context is known. Session lookup is by a SHA-256 hash of a cryptographically random opaque token; the raw token is only stored in an HttpOnly SameSite cookie.

## 4. Canonical factual time layer

`TimeEntry` is the canonical factual time record. Client/internal timesheets are snapshots/views derived from the same fact layer. Reconciliation stores the difference between internal fact and client-confirmed fact rather than maintaining a second unrelated manual timesheet.

A planned day off is not a no-show. A planned/assigned shift with no factual work may become a no-show according to attendance state.

## 5. Immutable accepted calculation scenario

Calculation models and rule versions are effective-dated. An accepted calculation scenario is an immutable snapshot of:

- model/rule version;
- inputs;
- grouped cost items;
- result.

The database trigger rejects edits to financial snapshot fields after acceptance. A change requires a new scenario/version. `ClientRate` can trace back to the accepted scenario.

No tax/legal configuration in the demo seed is presented as current legal advice. The synthetic seed explicitly marks legal parameters as unverified.

## 6. Effective-dated money rules

Worker rates and similar historical money rules use `effective_from/effective_to`. An integrity trigger prevents overlapping active worker-rate periods for the same worker/object pair.

## 7. Audit

Automatic before/after audit triggers cover high-risk tables including:

- permission grants and overrides;
- accepted calculation scenarios;
- worker/client rates;
- time corrections/timesheet snapshots;
- worker accruals/payments.

Business activity remains a separate human-readable stream.

## 8. Demo mode

`DEMO_MODE=true` exists only to inspect the UI and scope behavior when PostgreSQL is unavailable. The demo dataset is synthetic and read-only. Production mutations return a clear error instead of silently persisting to browser storage.

## 9. Visual contract

The UI follows the handoff V6 implementation contract rather than the legacy donor UI:

- light working canvas as canonical;
- restrained gray surfaces;
- orange primary accent;
- dense enterprise typography;
- line/border hierarchy instead of excessive cards;
- object-centric workspace;
- compact Kanban cards opening a detail drawer;
- resource scheduler semantics;
- full chart axes/tooltips/legend through Apache ECharts.

## 10. Organization Core

Organization Core extends the existing tenant, membership and capability model instead of introducing a second user system. `organization_units` form a mutable hierarchy whose node type can be company, department, region, branch, direction, team or project group. Positions are reusable job templates; process roles are independent functional assignments. Memberships connect a person to a primary position and one or more organizational units and process roles.

The existing `teams`, `regions` and `role_templates` remain operationally compatible. New authorization is additive and can be adopted gradually. Other modules consume stable membership, unit, position, role and capability identifiers rather than hard-coded department names.
