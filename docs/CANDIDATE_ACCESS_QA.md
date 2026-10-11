# Candidate documents and communications: access regression checks

Audit findings: PP-01 and PP-02 in OPERIS_MASTER_SPEC.md v2.1.

Document application scope queries now include organizationId before calling the shared row evaluator. Standalone document and communication writes always evaluate recruiting.candidate.edit scopes; an all_org grant on another capability no longer bypasses that check. Candidate-specific all_org remains supported. No schema changes or migrations are needed.

`tests/candidate-document-access.test.mjs` executes the actual GET/PATCH/POST handlers with the real access evaluator and mocked tenant SQL. It verifies selected tenant metadata, assigned and action-specific all_org access, missing capability, denied assignments despite an unrelated all_org grant, cross-tenant rows, returned document status, write/history calls, and no writes after denial. The SQL mock models projected columns to catch the missing organizationId regression. It is not a substitute for an authenticated database integration check.

Before the fix, the same 18 cases produce 10 passes and 8 failures against the unchanged route files at f64ecdcb. After the fix all 18 pass. Full unit/API suite: 195 tests, all pass. Separate TypeScript and changed-file ESLint checks pass.

No production changes, live customer records, permission grants, or schema migrations were performed. Application-specific communications context and the other access findings in the audit remain separate work; this patch does not claim to complete the entire access audit.
