# Candidate documents and communications: access regression checks

Audit findings: PP-01 and PP-02 in OPERIS_MASTER_SPEC.md v2.1.

Document application scope queries now include organizationId before calling the shared row evaluator. Standalone document and communication writes always evaluate recruiting.candidate.edit scopes; an all_org grant on another capability no longer bypasses that check. Candidate-specific all_org remains supported. No schema changes or migrations are needed.

`tests/candidate-document-access.test.mjs` executes the actual GET/PATCH/POST handlers with the real access evaluator and mocked tenant SQL. It verifies selected tenant metadata, assigned and action-specific all_org access, missing capability, denied assignments despite an unrelated all_org grant, cross-tenant rows, returned document status, write/history calls, and no writes after denial. The SQL mock models projected columns to catch the missing organizationId regression. It is not a substitute for an authenticated database integration check.

Before the fix, the same 18 cases produce 10 passes and 8 failures against the unchanged route files at f64ecdcb. After the fix all 18 pass. Full unit/API suite: 195 tests, all pass. Separate TypeScript and changed-file ESLint checks pass.

No production changes, live customer records, permission grants, or schema migrations were performed. Application-specific communications context and the other access findings in the audit remain separate work; this patch does not claim to complete the entire access audit.

## Organization and approval scope follow-up (CF-08, PP-03, PP-04, PP-12)

Approval list/page and decisions no longer treat an unrelated capability's aggregate allOrg flag as an approval-wide grant. Existing requester/assigned-approver behavior remains; this change is not a redesign of every approval scope.

Organization employees, staff positions, units and assignments use the shared row evaluator. Self no longer falls back to membership units or regions; resolved org_unit_subtree grants work. Assignments are filtered against visible employee/position context. Tree ancestors are retained as existing navigation context; their aggregate fields have not been separately sanitized by this patch. Demo unit visibility is now explicitly granted instead of relying on the old assigned_to_me fallback.

The employee access endpoint checks target-row scope before reading permission sources. Its effective summary uses loadEffectiveAccess, including individual override replacement and system grants, with the same membership context helper as authentication. Raw source records remain available separately.

Added 32 tests: approval isolation (7), organization row scopes (10), actual organization service wiring in tenant/demo paths (4), and actual access endpoint/resolver with mocked SQL (11). Full suite: 227 passed. TypeScript and production build passed; full ESLint has 0 errors and the existing 54 warnings. Changed test files also pass ESLint.

Production-build browser checks: /organization/staff, /organization/structure and /organization/departments for director, object manager and staff recruiter (9 page loads, all HTTP 200, no page errors). Employee rows: 13, 2 and 3 respectively. These are isolated demo sessions; the live access endpoint is validated here by mocked SQL, not by writes or queries to the customer database. No migrations or production promotion performed.

## Authenticated routes follow-up (UX-01)

The catchall and proposal print routes exported generateStaticParams returning [] in server mode. That enabled runtime static generation on pages that require session cookies, producing DYNAMIC_SERVER_USAGE and HTTP 500. They now expose static params only in GitHub Pages export mode; production server builds classify both routes as dynamic. The GitHub Pages parameter callbacks are retained, but the complete static export was not rerun in this block.

AppShell always filters future modules out of working navigation and quick search, including when an old SHOW_FOUNDATIONS=true environment setting is present. Existing future deep links show an explicit unavailable-section message, without technical capability codes, a fake empty registry or a claim that the feature is implemented. The existing platform passport remains reachable by deep link. Implemented document templates are now correctly marked active in the runtime navigation and remain capability-protected.

Full unit/API suite after the navigation regression case: 228 passed; production build (including TypeScript) and changed-file ESLint passed. No migrations or customer database writes. Vercel deployment inspection for the existing g942 project was blocked by API 403; no CLI is installed for fallback, and no new Preview URL was verified.

`QA_START_SERVER=1 node tests/authenticated-routes-browser.mjs` passed against the final production build: 22 manifest foundation paths (21 catchall notices and the existing platform passport) plus proposal print returned HTTP 200 in demo; all 23 redirected anonymous sessions to /login without 5xx. Expanded navigation and quick search exclude future paths while /requests and /admin/document-templates remain available. No page errors. An unknown path renders not-found UI with HTTP 200 and robots noindex (Next streamed soft 404), not an HTTP 404; do not describe it as the latter.

## Optional crews and shared status presentation (PP-10, UX-03, partial UX-02)

User clarification 11 Oct 2026: workers do not have to belong to a crew. Optional crews are secondary to existing employee/object workflows. A foreman may hold a dedicated role or combine ordinary work with foreman responsibilities and a higher individual rate. This block does not add a mandatory crew step or connect the currently unused crew workspace; standalone foreman assignment outside a crew and payroll treatment are not newly implemented here.

The existing crew POST endpoint now validates submitted members and an optional foreman against same-tenant active workers with effective assignments to the selected object and operations.crew.manage scope before inserts. An optional specialty must be active and belong to the tenant. A working foreman is included once; a dedicated foreman stays separate and an explicit conflicting membership returns a clear 400. Empty membership and no foreman remain accepted as before. Errors are localized and unexpected database errors are not exposed as raw response text.

22 new mocked-SQL route tests passed, covering effective/future/expired assignments, foreign/inactive/unassigned members and leaders, scopes, specialty validity, deduplication, both leader formats, optional empty composition, and no writes after rejection. Full suite: 250 passed. Production build with TypeScript and changed-file ESLint passed. These tests do not prove live database concurrency/RLS behavior; no migrations or customer database writes were performed.

Shared Status labels now use neutral text, no colored pill/background/border and semantic 6 px dots in the current visual mode. The task table scrolls in its own wrapper. The legacy 760 px body minimum is removed on narrow screens in this mode, and the demo-person selector fits the topbar. Custom components that do not use Status and the remaining mobile layouts are separate audit work.

Final production-build browser run: 24 checks across tasks, approvals, organization staff, finance, requests and an object card at 1440/390 px in light/dark themes. HTTP 200 and no page errors; shared Status styles checked where present, required on tasks/staff. Task body has no horizontal overflow; the table uses its own scroll and a 900 px minimum width to avoid excessively tall title wraps. Task screenshots visually inspected. Other routes are not claimed overflow-free by these assertions. Rebuilt and repeated browser checks after the table-width adjustment; changed-file ESLint and diff whitespace checks passed.
