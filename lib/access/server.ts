import type { Sql } from "postgres";
import type { AccessPreviewTargetType, Actor, EffectiveAccess, ScopeGrant } from "@/lib/access/types";
import { OWNER_SYSTEM_CAPABILITIES } from "@/lib/access/system";

type GrantRow = {
  capability: string;
  effect: "allow" | "deny";
  scope_type: ScopeGrant["type"];
  scope_ids: string[];
};

async function resolveGrantScopes(sql: Sql, grants: GrantRow[], membershipRegionIds: string[], membershipOrgUnitIds: string[]): Promise<GrantRow[]> {
  const subtreeRoots = new Set<string>();
  for (const row of grants) {
    if (row.scope_type !== "org_unit_subtree") continue;
    for (const id of row.scope_ids.length ? row.scope_ids : membershipOrgUnitIds) subtreeRoots.add(id);
  }

  const descendants = new Map<string, Set<string>>();
  if (subtreeRoots.size) {
    const rows = await sql.unsafe<Array<{ rootId: string; id: string }>>(
      `WITH RECURSIVE unit_tree(root_id,id) AS (
         SELECT id,id FROM organization_units WHERE id=ANY($1::uuid[])
         UNION ALL
         SELECT tree.root_id,ou.id
         FROM organization_units ou
         JOIN unit_tree tree ON ou.parent_id=tree.id
       )
       SELECT root_id "rootId",id FROM unit_tree`,
      [[...subtreeRoots]],
    );
    for (const row of rows) {
      const values = descendants.get(row.rootId) ?? new Set<string>();
      values.add(row.id);
      descendants.set(row.rootId, values);
    }
  }

  return grants.map((row) => {
    if (row.scope_type === "region" && row.scope_ids.length === 0) {
      return { ...row, scope_ids: membershipRegionIds };
    }
    if (row.scope_type === "org_unit" && row.scope_ids.length === 0) {
      return { ...row, scope_ids: membershipOrgUnitIds };
    }
    if (row.scope_type === "org_unit_subtree") {
      const roots = row.scope_ids.length ? row.scope_ids : membershipOrgUnitIds;
      return {
        ...row,
        scope_ids: [...new Set(roots.flatMap((root) => [...(descendants.get(root) ?? new Set([root]))]))],
      };
    }
    return row;
  });
}

function evaluateGrants(grants: GrantRow[]): EffectiveAccess {
  const capabilities = new Set<string>();
  const denies = new Set<string>();
  const scopes: Record<string, ScopeGrant[]> = {};

  for (const row of grants) {
    if (row.effect === "deny") {
      denies.add(row.capability);
      capabilities.delete(row.capability);
      delete scopes[row.capability];
      continue;
    }
    if (denies.has(row.capability)) continue;
    capabilities.add(row.capability);
    (scopes[row.capability] ??= []).push({ type: row.scope_type, ids: row.scope_ids });
  }

  return {
    capabilities: [...capabilities],
    denies: [...denies],
    allOrg: Object.values(scopes).some((items) => items.some((scope) => scope.type === "all_org")),
    scopes,
  };
}

function forceSystemCapability(access: EffectiveAccess, capability: string) {
  access.denies = access.denies.filter((item) => item !== capability);
  if (!access.capabilities.includes(capability)) access.capabilities.push(capability);
  access.scopes[capability] = [{ type: "all_org", ids: [] }];
}

export async function loadEffectiveAccess(sql: Sql, membershipId: string, roleTemplateId: string, positionIds: string[], membershipRegionIds: string[], membershipOrgUnitIds: string[]): Promise<EffectiveAccess> {
  const inherited = await sql<GrantRow[]>`
    SELECT capability, effect, scope_type, scope_ids FROM permission_grants
    WHERE role_template_id=${roleTemplateId}::uuid
    UNION ALL
    SELECT capability, effect, scope_type, scope_ids FROM position_permission_grants
    WHERE position_id=ANY(${positionIds}::uuid[])
    UNION ALL
    SELECT g.capability,g.effect,g.scope_type,g.scope_ids
    FROM membership_process_roles mr
    JOIN process_role_permission_grants g ON g.process_role_id=mr.process_role_id
    WHERE mr.membership_id=${membershipId}::uuid
      AND mr.effective_from <= current_date
      AND (mr.effective_to IS NULL OR mr.effective_to >= current_date)
  `;

  const access = evaluateGrants(await resolveGrantScopes(sql, inherited, membershipRegionIds, membershipOrgUnitIds));
  const overrides = await sql<GrantRow[]>`
    SELECT capability, effect, COALESCE(scope_type,'all_org') scope_type, scope_ids
    FROM user_permission_overrides
    WHERE membership_id=${membershipId}::uuid
      AND (effective_from IS NULL OR effective_from <= current_date)
      AND (effective_to IS NULL OR effective_to >= current_date)
    ORDER BY created_at ASC
  `;
  const resolvedOverrides = await resolveGrantScopes(sql, overrides, membershipRegionIds, membershipOrgUnitIds);

  for (const row of resolvedOverrides) {
    if (row.effect === "deny") {
      if (!access.denies.includes(row.capability)) access.denies.push(row.capability);
      access.capabilities = access.capabilities.filter((item) => item !== row.capability);
      delete access.scopes[row.capability];
      continue;
    }
    access.denies = access.denies.filter((item) => item !== row.capability);
    if (!access.capabilities.includes(row.capability)) access.capabilities.push(row.capability);
    access.scopes[row.capability] = [{ type: row.scope_type, ids: row.scope_ids }];
  }

  const [ownership] = await sql<Array<{ isOwner: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM organization_owners
      WHERE membership_id=${membershipId}::uuid
    ) "isOwner"
  `;
  const systemGrants = await sql<Array<{ capability: string }>>`
    SELECT capability
    FROM membership_system_grants
    WHERE membership_id=${membershipId}::uuid
      AND valid_from<=now()
      AND (valid_to IS NULL OR valid_to>now())
  `;

  for (const capability of systemGrants.map((item) => item.capability)) forceSystemCapability(access, capability);
  if (ownership?.isOwner) {
    for (const capability of OWNER_SYSTEM_CAPABILITIES) forceSystemCapability(access, capability);
  }

  access.allOrg = Object.values(access.scopes).some((items) => items.some((scope) => scope.type === "all_org"));
  return access;
}

export async function loadPreviewAccess(sql: Sql, targetType: AccessPreviewTargetType, targetId: string, membershipRegionIds: string[], membershipOrgUnitIds: string[]): Promise<EffectiveAccess> {
  let grants: GrantRow[];
  if (targetType === "role_template") {
    grants = await sql<GrantRow[]>`
      SELECT capability,effect,scope_type,scope_ids
      FROM permission_grants
      WHERE role_template_id=${targetId}::uuid
      ORDER BY created_at ASC
    `;
  } else if (targetType === "position") {
    grants = await sql<GrantRow[]>`
      SELECT capability,effect,scope_type,scope_ids
      FROM position_permission_grants
      WHERE position_id=${targetId}::uuid
      ORDER BY created_at ASC
    `;
  } else {
    grants = await sql<GrantRow[]>`
      SELECT capability,effect,scope_type,scope_ids
      FROM process_role_permission_grants
      WHERE process_role_id=${targetId}::uuid
      ORDER BY created_at ASC
    `;
  }
  return evaluateGrants(await resolveGrantScopes(sql, grants, membershipRegionIds, membershipOrgUnitIds));
}

export function requireCapability(actor: Actor, capability: string) {
  if (actor.access.denies.includes(capability)) throw new AccessDeniedError(capability);
  if (!actor.access.capabilities.includes("*") && !actor.access.capabilities.includes(capability)) throw new AccessDeniedError(capability);
}

export class AccessDeniedError extends Error {
  status = 403;
  constructor(public capability: string) { super(`Forbidden: missing ${capability}`); }
}
