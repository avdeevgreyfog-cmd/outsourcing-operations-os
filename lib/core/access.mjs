/**
 * Pure access-control evaluator. Database persistence lives in lib/access/server.ts.
 * Grants are action based and scopes are additive. Explicit deny wins.
 */
export function hasCapability(access, capability) {
  if (access.denies?.includes(capability)) return false;
  return access.capabilities.includes("*") || access.capabilities.includes(capability);
}

export function canReadRow(access, capability, row, actor) {
  if (!hasCapability(access, capability)) return false;
  if (row.organizationId !== actor.organizationId) return false;
  const scopes = access.scopes?.[capability] ?? [];
  return scopes.some((scope) => {
    switch (scope.type) {
      case "own_created": return row.createdByUserId === actor.userId;
      case "self": return row.userId === actor.userId || row.membershipId === actor.membershipId;
      case "assigned_to_me": return row.ownerUserId === actor.userId || row.assigneeUserIds?.includes(actor.userId);
      case "team": return !!row.teamId && actor.teamIds.includes(row.teamId);
      case "org_unit": return !!row.orgUnitId && (scope.ids.length ? scope.ids.includes(row.orgUnitId) : actor.orgUnitIds?.includes(row.orgUnitId));
      case "region": return !!row.regionId && scope.ids.includes(row.regionId);
      case "objects": return !!row.objectId && scope.ids.includes(row.objectId);
      case "clients": return !!row.clientId && scope.ids.includes(row.clientId);
      case "all_org": return true;
      default: return false;
    }
  });
}

export function canReadField(access, fieldCapability) {
  return hasCapability(access, fieldCapability);
}
