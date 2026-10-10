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


## Sales card refinement — 2026-10-10

The following checks cover the sales card changes after the user supplied the evening screenshots; earlier entries above describe earlier revisions.

- 177 unit/API tests pass, including request contact snapshot preservation, version conflicts, client row/capability checks, duplicate rejection and cross-client contact selection. Production build and TypeScript compilation pass. Full lint reports 0 errors and 54 existing warnings; changed components pass focused lint.
- Shared browser suite: 24 registry/quick-edit/block combinations at 1440/1024/768/390 px in light/dark. Save/reload checks include request schedule and new position, client notes and inline contact, tender data/analysis/position edit/new position/documents, plus new request creation and subsequent editing. No JavaScript/hydration errors or demo API writes. Saving scenarios repeated on the final production build.
- Refinement suite: 96 card-tab combinations at 1440/390 px in light/dark. Assertions cover tab inset, transparent status backgrounds/borders, page overflow and compact desktop position summaries (85 px). Request existing-contact selection and new contact creation are checked through the request and client cards, retaining request roles and provision.
- Screenshots inspected against the supplied examples: request overview and positions, tender submission, client contacts on mobile/dark. The active visual mode originally overrode tab padding; the final rule explicitly handles that mode. Forms use the shared inline layout.
- The final form check covers 16 inline add/edit layouts at 1440/390 px in both themes, with cancellation and page-overflow assertions.
- Browser checks use the repository's demo mode and existing data. API tests mock the tenant transaction; authenticated live database writes and protected Vercel browser flows are not certified by these checks.
