# Phase 2 status

## Release verdict

Phase 2 реализован как существенное расширение first-pass backbone, но release gate для production не закрыт. Причины: SQL migrations и RLS не прогнаны на реальном PostgreSQL, browser visual regression не выполнен в этой среде, deployment preview не создан.

## Реально работает в коде

### Shell и UI foundation

- capability-aware трёхуровневая навигация;
- независимое сворачивание уровней, compact mode и сохранение только UX-настроек;
- active route, breadcrumbs, contextual entity tabs;
- Ctrl+K по доступным разделам;
- light/dark tokens и единая Lucide iconography;
- data-grid foundation: search, sorting, row selection, show/hide columns, sticky header/column, row navigation;
- loading/empty/error primitives.

### Entity workspaces

- Client: обзор, заявки, расчёты, объекты, финансы и contextual sections;
- Request: условия, позиции и связанные расчёты;
- Object: 11 настоящих URL-addressable tabs, operational overview, needs, recruiting, people, shifts, timesheets and finance routes;
- Candidate: registry, Kanban detail drawer и full page;
- Worker: profile, assignments, schedule, accruals/payments visibility by capability.

### Operations

- needs registry связан с object workspace;
- day/week/month scheduler representation и grouping;
- shift detail drawer и ссылки в назначения/подбор;
- full-month timesheet grid, half-month modes, client/internal separation, CSV export;
- reconciliation summary;
- Gantt/WBS с baseline, dependencies, milestones, progress, risk и critical-path state;
- incidents registry and migration.

### Economics

- calculator: TK/GPH/NPD/custom model selection, grouped costs, bases, enable/disable, add/remove/duplicate expenses, export;
- NPD не выдаёт вымышленные лимиты без active legal rule version;
- rate reference with source/date/confidence;
- proposal list with versions and accepted scenario count;
- accrual and payment ledgers;
- P&L lineage preserved;
- object comparison and workforce analytics.

### Access and security

- existing RLS/session/capability/scope/field model preserved;
- individual override editor uses server route and validates tenant membership;
- inherit/allow/deny supported; explicit deny semantics preserved;
- high-risk overrides remain covered by audit trigger;
- calculation scenario API column corrected to canonical `cost_snapshot`.

## Scaffold / Phase 3

- full contact CRUD and communication history;
- full request creation/edit form with all conditional fields;
- proposal preview/export/client comments workflow;
- persistent scheduler mutations, recurring shifts and conflict engine;
- documents upload/storage/retention/malware scanning;
- compliance rule editor and document completeness engine;
- incident creation/resolution UI and attachments;
- worker discipline/evidence/resolution CRUD;
- temporal analytics with 7d/30d/3m/6m/1y comparison datasets;
- advanced DataGrid column resize/reorder, saved views, grouping and virtualization;
- task/comments/files CRUD;
- object expense CRUD and plan/forecast/fact editor;
- end-to-end browser suite against deployed PostgreSQL environment.

## Golden Path

The schema and demo seed still preserve:

`Request → accepted Calculation Scenario → Proposal → Object → Need → CandidateApplication → Worker → ShiftAssignment → Attendance → TimeEntry → Timesheet → Accrual → Payment → Client revenue/Object expense → P&L`.

New UI routes do not introduce parallel business persistence or localStorage data storage.
