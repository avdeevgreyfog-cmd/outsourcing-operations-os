# Sales reference UI verification — 2026-09-09

Scope: requests (list / board / analytics / drawer / entity / creation form),
clients, proposals and tenders. Existing architecture and backend actions retained.

## Checks completed

- Existing unit suite: 26 passed, 0 failed.
- TypeScript check passed.
- ESLint: no errors; 28 pre-existing warnings in legacy components and static preview.
- Production build passed in demo mode.
- Browser desktop: request list in light theme; board, entity and drawer inspected;
  warning surface readable in dark theme; clients, proposal list/detail and tenders
  inspected in dark theme; request form and section navigation inspected.
- Stage filter narrows the list, reset restores the rows, unmatched search shows a
  helpful empty state. Analytics stage button opens the corresponding filtered list.
- Native request drawer opens and dismisses via Escape. Focus return is supplied by
  the native dialog with explicit restoration to the initiating control.
- Views use shared metrics/search/segments; charts show real counts and zero-width
  zero values. No completed outcomes displays an unavailable rate rather than 0%.
- Design scanner reports two existing sticky-form blur uses; these describe an
  actual overlapping action surface and are retained. No decorative imagery added.

## Limits

- Browser used the repository's demo data, without saving business records. Database
  migrations, live write workflows, RLS, document export and external sharing were
  not exercised in this visual change.
- Mobile breakpoints are implemented but have not been visually exercised in a
  mobile browser. No claim of complete accessibility or mobile QA is made.
- Existing demo data may disagree between legacy request status and commercial
  workflow status. This work fixes client request/object list counts to match scoped
  details; it does not certify all domain data sources.
- GitHub Pages' independent static preview is not the application reference. These
  changes target the Next.js application used by the Vercel deployment.

Reusable rules and adoption checklist: `docs/UI_SYSTEM.md`.
