# First pass status

## Functional in code

### Platform
- single Next.js application shell;
- production DB session authentication route;
- demo-role preview mode;
- organization/users/memberships/teams/regions/role templates schema;
- capability grants, scoped grants, individual overrides schema;
- tenant RLS boundary;
- server-side scope evaluator and field permission filtering;
- grouped permission-aware navigation;
- personalized command center;
- audit foundation;
- shared tasks/comments/files/activity schema.

### Business backbone
- linked schema for client/request/calculation/proposal/object/need/candidate/worker/shift/time/accrual/payment/P&L;
- client, request, calculation, object, need, recruiting, worker, shift, timesheet and finance read workspaces;
- production mutation routes for client creation, request creation, calculation scenario creation, candidate-stage change and factual time correction;
- object-centric detail workspace;
- resource scheduler view;
- canonical fact timesheet + reconciliation view;
- recruiting Kanban with detail drawer;
- calculator with grouped employee/project costs and scenario result;
- P&L table and ECharts portfolio visualization.

### Golden Path seed
Synthetic database seed links:

`Request → accepted Calculation Scenario → Proposal → Object → Need → CandidateApplication → Worker(origin_candidate_id) → ShiftAssignment → Attendance → TimeEntry → Timesheet snapshot → WorkerAccrual → Advance/Payment → ClientRevenueLine/ObjectExpense → P&L snapshot`.

## Scaffolded / not yet deepened

- lead workspace and interaction UI;
- proposal editor/export UX;
- rate-reference editing UX;
- launches UI;
- incidents/documents workspaces and storage upload flow;
- full worker profile tabs;
- accrual/payment operational ledgers beyond summaries;
- editable permission matrix/override UI (read/preview works, DB mutation UI remains to deepen);
- Gantt/WBS screen;
- expanded comparison-period analytics/report exports;
- integrations.

## Environment verification in this build session

Executed:

- pure domain tests: access control, calculation math, timesheet/no-show/reconciliation logic.

Not executable in the current sandbox because package network / PostgreSQL / browser runtime are unavailable:

- `npm install`;
- Next.js production build;
- ESLint with project dependencies;
- full TypeScript validation against installed Next/React types;
- SQL migration execution against PostgreSQL;
- browser/e2e test suite;
- deployment preview.

Those items must not be reported as passed until CI or a deployment environment actually runs them.
