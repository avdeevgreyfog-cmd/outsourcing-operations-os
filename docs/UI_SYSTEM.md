# UI system

## Design contract

- **Thesis:** dense, quiet Russian operations software for an eight-hour workday.
- **Signature:** object-centric contextual workspaces that keep lineage visible without expanding the global navigation.
- **Palette:** white canvas, neutral gray hierarchy, orange action accent; green/amber/red/blue only for semantics.
- **Typography:** Segoe UI Variable with verified Cyrillic coverage; 12–14 px working text, 24 px page headings.
- **Layout:** desktop-first, 252 px hierarchical sidebar, compact 68 px mode, maximum working width 1680 px.
- **Surfaces:** 7 px controls, 9 px panels, borders before shadows, cards only for bounded working surfaces.
- **Motion:** short state transitions only; reduced-motion respected.

## Navigation

The target information architecture is declared once in `lib/core/navigation.mjs`. Every item has a canonical section, group and route. Modules marked `foundation` have a real baseline workspace describing their purpose, process, core fields, relations and next implementation scope. They are visible in demo and platform-administration contexts, remain capability-safe in the production context and contain no fake operations or demo records.

Level 1 and Level 2 are collapsible. Level 2 remains visible inside an expanded section even when only one group is available to the current role. Level 3 appears only in an open subgroup, while the active route and its parent hierarchy remain expanded. Contextual entity tabs own the long-lived third level inside clients, requests, objects and workers. Navigation items are filtered by server-provided effective access.

An available route must appear only once in global navigation. Cross-cutting access from another context belongs in entity links, command search or a summary, not in a second equal sidebar destination.

## Organization Core

Organization Core uses two complementary working modes inside the existing shell: a compact hierarchical chart for understanding reporting structure and an employee directory for finding responsibility and contacts. The chart favors branch density, explicit connectors, collapse controls and a bounded zoom range; it does not introduce a separate diagramming visual language. Catalogs for positions, roles and units reuse the existing panels, controls, tables and status treatments.

## Data grid

Current foundation supports sticky headings and identity column, search, sorting, selection, show/hide columns and row navigation. Column resize/reorder, saved views, grouping and virtualization remain Phase 3.

## States

Reusable primitives exist for loading skeleton, empty result, error and permission-safe absence. Demo mutations must explicitly report read-only status; they cannot silently persist in browser storage.

## Dark theme

Dark tokens define distinct surface, border, status and chart hierarchy. It is not CSS inversion. Browser screenshot verification is still required before release.

## Sales reference implementation (September 2026)

The reference is the existing `/requests`, `/clients`, `/proposals`, and `/tenders`
workspaces, not a separate demo page. Their nested layouts compose `SalesLayout`.
`app/sales-system.css` is the final scoped theme layer after legacy styles. Extend
this layer and `components/sales/` rather than adding another `final/polish` file.
Other modules adopt this system deliberately, after checking their working density.
The command center remains a personal cross-module queue; sales analysis stays in
Requests → Analytics. No second command center has been introduced.

### Contract

- Existing Segoe UI family and Cyrillic content. Page title 28 px, entity title / main
  table identity 14 px, working controls 13 px, supporting metadata 12 px.
- Existing canvas, panel and semantic tokens. Light-theme primary button uses dark
  orange with white text; dark-theme primary uses orange with near-black text.
- Four unboxed metrics with quiet separators, consistent across the sales registries.
  No outcomes means “—”, not a fabricated 0% success rate.
- A view/action toolbar, followed by filters when needed. Search has a visible icon,
  accessible name and clear action. Segment buttons expose `aria-pressed`.
- Panels 10 px, controls 7 px, spaces 12 / 18 / 20 px. Border-only default panels.
  Data rows fit content, numerical columns use tabular figures; overflow belongs to
  the table or board, not the page.
- One entity heading, contextual tabs, compact summary, conditions and responsibility.
  Missing provision data is expandable rather than eight equally prominent empty rows.
- Warning/error surfaces use semantic theme tokens. Focus has a visible outline;
  reduced motion is respected.

### Reusable pieces

| Component | Responsibility |
| --- | --- |
| `SalesLayout` | Opt-in scope for registry, entity, form and responsive styles |
| `SalesMetrics` | Label / value / explanatory denominator or period |
| `SalesSegments` | Accessible view or filter choice, with optional icons |
| `SalesSearch` | Labelled search with a clear button |
| `SalesEmpty` | Helpful empty or filtered state with optional reset |
| `SalesDrawer` | Native modal, focus containment/return, Escape, scroll isolation |
| `RequestInsights` | Current distribution, recorded outcomes, inactivity by update date |

The request drawer reuses already-authorized list data and existing stage API;
capabilities and server validations still govern writes. It is not a second editor.
Charts are real HTML controls, keyboard-accessible and proportional. The distribution
is a snapshot, not historical conversion. Inactivity measures last record update,
not a customer contact or stage-entry timestamp. Counts for client requests/objects
are derived from the same scoped lists as the client detail page.

At narrow widths sales uses a compact navigation rail with an expandable menu,
stacked filters, two-column metrics, single-column detail panels and bounded table
scrolling. Preserve the document preview's separate white print surface.

### Adoption checklist

1. Use the existing authorization-aware loader and actual records.
2. Compose common components instead of copying their markup/styles.
3. Retain entity links, domain-specific actions and semantic status labels.
4. Verify light/dark, filters and reset, empty states, keyboard dismissal/focus,
   long Russian labels, table overflow and the module's primary form.
5. Record the limits of verification. Do not equate a visual pass with database,
   permissions or transaction validation.

Development remains Next.js. `scripts/dev.mjs` translates the supervised preview's
host flag, retaining native Next behavior; `terminal.local` is an allowed development
origin only. Local demo environment settings are ignored, never published as secrets.
