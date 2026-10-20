import {canReadRow} from '../core/access.mjs';

export function canReadCompanyEmployee(actor, row) {
  return canReadRow(actor.access, 'organization.read', {...row, membershipId:row.id}, actor);
}

export function canReadOrganizationPosition(actor, row) {
  return canReadRow(actor.access, 'organization.read', row, actor);
}

export function filterOrganizationUnits(actor, rows) {
  const permitted=new Set(rows.filter(row=>canReadRow(actor.access,'organization.read', {...row,orgUnitId:row.id},actor)).map(row=>row.id));
  const keep=new Set(permitted);
  // Preserve the existing tree context without granting access to employees
  // or positions merely because an ancestor is needed to draw a branch.
  let changed=true;
  while(changed){changed=false;for(const row of rows){if(keep.has(row.id)&&row.parentId&&!keep.has(row.parentId)){keep.add(row.parentId);changed=true;}}}
  return rows.filter(row=>row.organizationId===actor.organizationId&&keep.has(row.id));
}

export function filterOrganizationAssignments(actor, rows, employees, positions) {
  const memberships=new Set(employees.map(row=>row.id));
  const seats=new Set(positions.map(row=>row.id));
  return rows.filter(row=>row.organizationId===actor.organizationId&&memberships.has(row.membershipId)
    && (seats.has(row.staffPositionId)||canReadRow(actor.access,'organization.read',row,actor)));
}
