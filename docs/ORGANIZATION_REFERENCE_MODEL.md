# Organization Core: reference model

This note records the transferable patterns used for the operating model. It is not a plan to reproduce another vendor's UI.

## Primary sources

- Workday, [Organizations and Hierarchies](https://doc.workday.com/workday-education/en-us/course-manuals/hcm-core-for-administrators/organizations-and-hierarchies.html)
- Workday, [Staffing Models](https://doc.workday.com/workday-education/en-us/course-manuals/hcm-core-for-administrators/staffing-models.html)
- Workday, [Organization Management](https://www.workday.com/en-gb/products/human-capital-management/human-resource-management/org-management.html)
- SAP, [Setting Up the Position Organization Chart](https://help.sap.com/docs/successfactors-employee-central/implementing-position-management/setting-up-position-organization-chart)
- SAP, [Position Types](https://help.sap.com/docs/successfactors-employee-central/implementing-position-management/position-types)
- Microsoft, [View and explore your organization](https://support.microsoft.com/en-us/viva/view-and-explore-your-organization)
- Personio, [Overview of the Org Chart](https://support.personio.de/hc/en-us/articles/360017540757-Overview-of-the-Org-chart)
- Personio, [Manage the Org Chart](https://support.personio.de/hc/en-us/articles/29762795544989-Manage-the-Org-chart)

## Reference decisions

| Reference | Pattern adopted | Adaptation for OPERIS | Pattern not adopted |
| --- | --- | --- | --- |
| Workday Organization Management | Multiple organization dimensions; position management; current and future structures | Units remain type-configurable; job profiles are separated from concrete staff positions; changes have effective dates | HR-suite breadth, proprietary supervisory-organization terminology and a full workforce-planning product |
| SAP SuccessFactors Position Management | Position exists independently of the incumbent; past/current/future position views; shared positions | Staff position has capacity, status, reporting position and dated assignments | A form-heavy Employee Central clone and SAP-specific foundation-object hierarchy |
| Microsoft Viva Org Explorer | Person-focused discovery with manager, peers, reports and contacts | Employee drawer remains available from the structure and directory, with structural and functional context | Treating Microsoft 365 profile data as the organization system of record |
| Personio Org Chart | Compact cards, search, filters, people/department/team views, open-position visibility | Dense view switch, small cards, server-ready filters and explicit open-seat counts | Using a visual chart as the editor or hiding structural governance behind drag-and-drop only |

## Canonical model

1. Company and legal entities.
2. Organization units: department, region, branch, direction, team or project group.
3. Job profile: reusable description of purpose, duties and baseline capabilities.
4. Staff position: concrete seat in a unit, with capacity, reporting relation, status and effective dates.
5. Assignment: employee occupies a seat as primary, additional or acting with FTE and dates.
6. Process role: function performed independently of position.
7. Capability grant and data scope.
8. Responsibility rule used by workflows, tasks, objects and approvals.
9. Individual time-bounded exception.
10. Change set and audit history.

Corporate employees and outsourced object workers remain different aggregates. A user account may authenticate a corporate employee, but is not itself an employee, a position or a role.

## Screen architecture

- `/organization/structure`: current structure, switchable between organization units and staff positions; search, region filters, collapse and zoom.
- `/organization/staff`: corporate directory and person context.
- `/organization/positions`: job profiles, staff positions, process roles and responsibility matrix.
- `/organization/departments`: unit registry, structure diagnostics, dated reorganization packages and templates.

The routes stay stable. Additional concerns are views and contextual panels rather than new sidebar modules.

## Workflow integration

A workflow step targets a responsibility type and resolver subject, not a named employee. The resolver finds the current effective assignment within the requested object, client, region or unit scope and then applies the configured fallback. Tasks store the resolved assignee and the source rule so history remains understandable after the structure changes.

## Next release gates

- Enforce capability scopes in every organization query, including field-level contact visibility.
- Add edit and impact-preview UI for change sets before enabling production reorganization writes.
- Add overlap and capacity validation for effective-dated assignments at transaction level.
- Add temporary substitution and departure handoff.
- Run migrations and RLS tests against a disposable PostgreSQL database before production rollout.
