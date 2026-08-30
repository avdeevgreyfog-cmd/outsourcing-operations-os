import type { Sql } from "postgres";
import type { Actor, EffectiveAccess, ScopeGrant } from "@/lib/access/types";

export async function loadEffectiveAccess(sql: Sql, membershipId: string, roleTemplateId: string, membershipRegionIds: string[]): Promise<EffectiveAccess> {
  const grants = await sql<{
    capability: string;
    effect: "allow" | "deny";
    scope_type: ScopeGrant["type"];
    scope_ids: string[];
  }[]>`
    SELECT capability, effect, scope_type, scope_ids
    FROM permission_grants
    WHERE role_template_id=${roleTemplateId}::uuid
  `;

  const overrides = await sql<{
    capability: string;
    effect: "allow" | "deny";
    scope_type: ScopeGrant["type"] | null;
    scope_ids: string[];
  }[]>`
    SELECT capability, effect, scope_type, scope_ids
    FROM user_permission_overrides
    WHERE membership_id=${membershipId}::uuid
    ORDER BY created_at ASC
  `;

  const capabilities = new Set<string>();
  const denies = new Set<string>();
  const scopes: Record<string, ScopeGrant[]> = {};

  for (const row of grants) {
    if (row.effect === "deny") {
      denies.add(row.capability);
      capabilities.delete(row.capability);
      continue;
    }
    capabilities.add(row.capability);
    const ids = row.scope_type === "region" && row.scope_ids.length === 0 ? membershipRegionIds : row.scope_ids;
    (scopes[row.capability] ??= []).push({ type: row.scope_type, ids });
  }

  for (const row of overrides) {
    if (row.effect === "deny") {
      denies.add(row.capability);
      capabilities.delete(row.capability);
      continue;
    }
    denies.delete(row.capability);
    capabilities.add(row.capability);
    if (row.scope_type) (scopes[row.capability] ??= []).push({ type: row.scope_type, ids: row.scope_ids });
  }

  return {
    capabilities: [...capabilities],
    denies: [...denies],
    allOrg: Object.values(scopes).some((items) => items.some((s) => s.type === "all_org")),
    scopes,
  };
}

export function requireCapability(actor: Actor, capability: string) {
  if (actor.access.denies.includes(capability)) throw new AccessDeniedError(capability);
  if (!actor.access.capabilities.includes("*") && !actor.access.capabilities.includes(capability)) throw new AccessDeniedError(capability);
}

export class AccessDeniedError extends Error {
  status = 403;
  constructor(public capability: string) { super(`Forbidden: missing ${capability}`); }
}
