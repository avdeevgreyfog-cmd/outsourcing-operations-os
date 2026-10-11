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
