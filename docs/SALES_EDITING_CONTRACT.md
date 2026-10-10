# Commerce / Sales: editing contract

Updated: 2026-10-10.

The existing OPERIS registries and full cards remain the source of truth. No replacement cards or standalone demonstration site.

| Entry | Requests / tenders / clients |
| --- | --- |
| Record title or eye | Read-only preview drawer |
| Quick edit in preview | Filled form for the main fields; explicit save and cancel |
| Arrow or “Open card” | Existing canonical entity URL |
| Edit on a full card | Edit the selected block in place; one block at a time |
| Create | Existing creation workflow; existing records are never presented as new |

Request blocks: customer/object/contact; positions and launch volume; schedule and hours; provision/logistics; worker requirements; commercial terms and responsibility. Tender blocks: procurement data; analysis; structured positions. Client blocks: company data; responsibility; notes; individual contacts. Other existing card tabs, documents, calculations and workflow controls stay available under their original permissions.

Saving a request block merges only that block into the current record on the server. Role IDs, unknown conditions and provision costs are retained. Client compact saves retain omitted notes and assignments. Tender core and analysis saves preserve unrelated structured data. Editing source data never rewrites existing approved calculation versions; affected economics must be reviewed separately.

Core editors submit the loaded `updated_at` version; a stale version returns 409 before writes. Errors remain visible in the editor and retain the entered values. Cancel, navigation and closing an edited drawer warn before discarding input. Disabled fields and actions prevent submitting or closing during a save. Edit buttons and inputs support keyboard focus. Native forms validate required fields and accept Enter.

Live mode uses the existing authenticated tenant APIs and capability/row scope checks. Demo mode uses the same editing components with the existing browser storage. Demo tender/client snapshots merge detailed roles, contacts and documents rather than replacing them with registry summaries. Demo storage is browser-local; it does not write business data to the server.

Live history shows actual before/after changes from existing request audit records and client/tender activity events. No schema migration is required.

Verification: `npm test`, `npm run lint`, `npm run build`; `QA_START_SERVER=1 QA_PRODUCTION=1 node tests/sales-block-editing-browser.mjs` checks all three registries in both themes at 1440, 1024, 768 and 390 px, quick edit save/cancel, block save/reload, retained detailed data, new request creation and subsequent editing. The older commercial browser entry points delegate to this shared suite.

Typography follow-up: keep the existing Segoe UI stack; use Russian labels for request schedules, tender analysis choices and saved cost calculations. Framed counters and buttons center their labels, status badges accommodate the text height, and long section/drawer headings wrap. Plain section headings retain their existing alignment.

Sales card refinement: inset the first tab by 18 px (14 px on mobile), including the current visual mode. Use ordinary muted status labels and 6 px semantic dots without colored backgrounds or frames. Position summaries stay compact; extra requirements and historical rates are expandable. Small related records use the shared inline form with explicit save/cancel and one editor at a time. Requests and tenders allow adding positions to saved records while keeping previous positions and calculation snapshots.

Contacts share name, position, phone/email/messenger controls and preferred channel. The request contact block can retain a private snapshot, select an existing contact belonging to its client, or create a client contact. Live contact creation and request linking run in one tenant transaction after version and permission checks; client locking prevents concurrent duplicate creation. Historical request intake outside the contact block is retained. Demo snapshots use the existing scoped browser storage, and rollback the client snapshot if saving the request fails.

Additional verification: `node tests/sales-refinement-browser.mjs` (with `QA_START_SERVER=1`) checks 96 card-tab combinations at 1440/390 px in both themes, inset tabs, transparent statuses, position density, page overflow and choosing/creating a contact from a request. Live API tests cover tenant/row capabilities, cross-client selection, duplicate creation, accepted-stage locking and stale versions. These mocked API tests do not replace an authenticated end-to-end live database check.
