import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, hasDatabase, withTenant } from "@/lib/db/client";
import { loadEffectiveAccess } from "@/lib/access/server";
import type { Actor } from "@/lib/access/types";
import { getDemoActor } from "@/lib/demo/access";

export const SESSION_COOKIE = "oo_session";
export const DEMO_COOKIE = "oo_demo_role";

export async function getCurrentActor(): Promise<Actor | null> {
  const store = await cookies();
  if (process.env.DEMO_MODE === "true") {
    return getDemoActor(store.get(DEMO_COOKIE)?.value ?? "director");
  }
  if (!hasDatabase()) return null;
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const sql = db();
  const [session] = await sql<{ user_id: string; organization_id: string }[]>`
    SELECT user_id, organization_id FROM sessions
    WHERE token_hash=${tokenHash} AND expires_at > now()
    LIMIT 1
  `;
  if (!session) return null;

  return withTenant(session.organization_id, session.user_id, async (tx) => {
    const [row] = await tx<{
      membership_id: string; user_id: string; organization_id: string; display_name: string; email: string;
      role_template_id: string; role_code: string; role_name: string; primary_team_id: string | null;
    }[]>`
      SELECT m.id membership_id, u.id user_id, m.organization_id, u.display_name, u.email,
             r.id role_template_id, r.code role_code, r.name role_name, m.primary_team_id
      FROM organization_memberships m
      JOIN app_users u ON u.id=m.user_id
      JOIN role_templates r ON r.id=m.role_template_id
      WHERE m.user_id=${session.user_id}::uuid AND m.organization_id=${session.organization_id}::uuid AND m.status='active'
      LIMIT 1
    `;
    if (!row) return null;
    const teams = await tx<{ team_id: string }[]>`SELECT team_id FROM membership_teams WHERE membership_id=${row.membership_id}::uuid`;
    const regions = await tx<{ region_id: string }[]>`SELECT region_id FROM membership_regions WHERE membership_id=${row.membership_id}::uuid`;
    const teamIds = [...new Set([row.primary_team_id, ...teams.map((x) => x.team_id)].filter(Boolean) as string[])];
    const regionIds = regions.map((x) => x.region_id);
    const access = await loadEffectiveAccess(tx, row.membership_id, row.role_template_id, regionIds);
    return {
      userId: row.user_id, organizationId: row.organization_id, membershipId: row.membership_id,
      displayName: row.display_name, email: row.email, roleCode: row.role_code, roleName: row.role_name,
      teamIds, regionIds, access, demo: false,
    } satisfies Actor;
  });
}

export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) { redirect("/login"); throw new Error("redirect"); }
  return actor;
}

export function hashSessionToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
