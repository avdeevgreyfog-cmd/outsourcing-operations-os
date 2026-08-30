# UI system

## Design contract

- **Thesis:** dense, quiet Russian operations software for an eight-hour workday.
- **Signature:** object-centric contextual workspaces that keep lineage visible without expanding the global navigation.
- **Canonical theme:** light-first. White canvas, warm neutral hierarchy, orange action accent; dark mode is a separately tuned equivalent.
- **Typography:** Segoe UI Variable with verified Cyrillic coverage; 12.5–14 px working text, 25 px page headings. 10 px is reserved for truly secondary technical metadata.
- **Layout:** desktop-first, 252 px hierarchical sidebar, compact 68 px mode, maximum working width 1680 px.
- **Surfaces:** borders and spacing before cards; bounded registry surfaces may use 8 px panels, while entity workspaces should prefer dividers and typography over nested boxes.
- **Color:** orange is action/selection; green/amber/red/blue are semantic only. Workflow statuses use compact rectangular chips rather than universal pills.
- **Motion:** short state transitions only; reduced-motion respected.

## Navigation

The global sidebar intentionally has **two visual levels**:

1. business area (`Коммерция`, `Операции`, `Люди`, etc.);
2. visible subgroup label + direct destinations.

Subgroups are labels, not another accordion level. This avoids the "folder tree" effect. Contextual entity tabs own deeper navigation inside clients, objects and workers. Navigation items are filtered by server-provided effective access. `Ctrl+K` remains the fast expert path.

## Entity workspaces

The entity is the page. In particular, Object Workspace must not look like a card embedded into a generic dashboard. Object identity, status, key operational numbers and contextual tabs form one continuous workspace header.

Inside entity workspaces:

- use typography, spacing and dividers before adding another bordered panel;
- keep primary operational exceptions visible above secondary history;
- use drawers as compact mini-workspaces with clear hierarchy and sticky actions;
- do not repeat explanatory architecture text in everyday UI.

## Summary metrics

Metrics are an operational summary strip rather than four independent KPI cards. Keep values scannable and compact; use semantic side markers only when a metric actually needs attention.

## Data grid

Current foundation supports sticky headings and identity column, search, sorting, selection, show/hide columns, row navigation and compact/comfortable density switching. Selection is visually explicit and can be cleared in-place.

Phase 3 remains responsible for column resize/reorder, saved views, grouping, virtualization and real bulk mutation actions.

## States

Reusable primitives exist for loading skeleton, empty result, error and permission-safe absence. Demo mutations must explicitly report read-only status; they cannot silently persist in browser storage.

## Dark theme

Dark tokens define distinct surface, border, status and chart hierarchy. It is not CSS inversion. New components must be reviewed in both themes, while light remains the canonical handoff/screenshot theme.
