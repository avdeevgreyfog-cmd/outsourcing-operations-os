# Security model

## Authorization layers

1. **Authentication** — opaque server session or explicitly enabled demo role.
2. **Tenant boundary** — PostgreSQL RLS using transaction-local organization context.
3. **Capability authorization** — action-specific grants, e.g. `time.time_entry.edit`.
4. **Row/data scope** — own, assigned, team, region, explicit objects/clients, all organization.
5. **Field restrictions** — separate capabilities for worker compensation and personal documents.
6. **Audit** — before/after history on high-risk changes.

Frontend navigation is not an authorization boundary.

## Important invariants

- explicit deny overrides allow;
- scopes are capability-specific;
- organization mismatch always rejects a row;
- sensitive compensation is not selected from SQL if the actor lacks the field capability;
- accepted calculation snapshots cannot be mutated in-place;
- time corrections require a reason and actor attribution;
- session tokens are stored server-side only as hashes.

## Items requiring deployment hardening

- rate-limit login and mutation endpoints at the edge/reverse proxy;
- set production CSP and trusted origins;
- rotate `SESSION_SECRET` / environment credentials through deployment secrets;
- configure database backups and PITR;
- use private storage buckets and signed URLs for personal documents;
- add malware scanning and document retention policies before production document upload;
- review every new query/mutation against capability + scope + field rules.
