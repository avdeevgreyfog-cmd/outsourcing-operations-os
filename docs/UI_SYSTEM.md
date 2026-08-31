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

## Data grid

Current foundation supports sticky headings and identity column, search, sorting, selection, show/hide columns and row navigation. Column resize/reorder, saved views, grouping and virtualization remain Phase 3.

## States

Reusable primitives exist for loading skeleton, empty result, error and permission-safe absence. Demo mutations must explicitly report read-only status; they cannot silently persist in browser storage.

## Dark theme

Dark tokens define distinct surface, border, status and chart hierarchy. It is not CSS inversion. Browser screenshot verification is still required before release.
