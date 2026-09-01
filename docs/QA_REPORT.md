# QA report — Phase 2

## Passed in this environment

- `npm run test`: 9/9 pure domain/access tests passed;
- `npm run typecheck`: passed;
- `npm run lint`: passed;
- `DEMO_MODE=true npm run build`: passed, 34 routes generated;
- anti-template deterministic scanner: no signals found;
- code review of Director, Regional Manager, Object Manager, Recruiter, Economist and Finance navigation/data boundaries.

## Defects found and fixed during QA

- calculation mutation referenced nonexistent `cost_items_snapshot`; corrected to canonical `cost_snapshot`;
- Regional Manager analytics route lacked the scoped P&L capability required by its own page; demo role corrected to region-scoped finance access;
- decorative object tabs replaced with URL-addressable views;
- decorative scheduler/analytics/calculator controls removed or made functional;
- Unicode/emoji-style theme icon replaced with the shared Lucide system;
- production permission editor now has a server mutation instead of a visual-only matrix.

## Browser QA status

`tests/browser-qa.mjs` covers command center, object workspace, recruiting drawer, worker profile, scheduler, monthly timesheet, calculator, permissions, Gantt, dark theme and 1920 comparison screenshot.

The complete suite was not completed in this runtime. The cloud browser blocks loopback URLs, while the local tool environment stopped the combined dev-server/headless-browser operation partway through. Four real 1440×900 light screenshots were created and visually reviewed: command center, object needs, recruiting drawer and worker profile. Scheduler, timesheet, calculator, permissions, Gantt, 1920 and dark-theme captures remain unverified.

## Not executed

- migrations `0001–0004` against a real PostgreSQL instance;
- RLS cross-tenant integration tests;
- accepted-scenario and worker-rate triggers against PostgreSQL;
- complete browser visual regression set (partial 1440 light review only);
- file storage/document upload security;
- deployment preview.

## Release gate

GitHub CI now provisions PostgreSQL 17, applies every migration and the demo seed, then verifies Organization Core RLS, tenant-reference integrity, assignment capacity/FTE rules, audit history and responsibility resolution. Production rollout still requires applying the same migrations to the target database and validating its credentials/configuration; the ephemeral CI database is not a substitute for a production migration.

## Organization Core verification — 2026-09-01

- 22 domain/access/navigation tests passed.
- TypeScript, ESLint and the optimized Next.js production build passed.
- Organization browser harness passed all four canonical routes with search, tree modes, zoom/fit, contextual drawers, position vacancy view, responsibility matrix, dark theme and console-error capture.
- Rendered output was captured and visually inspected at 1366×768, 1440×900 and 1920×1080; the dense desktop layout keeps controlled horizontal scrolling at the narrow breakpoint.
- The anti-template scanner found no deterministic generic-design signals.
- Migration `0007_organization_production.sql` adds tenant-reference and assignment-capacity invariants, but was not applied to a live PostgreSQL instance in this workspace because no database credential is available here. The public Vercel URL runs demo data and does not exercise production persistence.
