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

Production release is blocked until PostgreSQL migration/RLS tests and browser QA pass in CI or deployment. The current result is a build-passing Phase 2 implementation, not a production-ready release.
