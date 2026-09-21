import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, hasDatabase, withTenant } from "@/lib/db/client";
import { loadEffectiveAccess, loadPreviewAccess } from "@/lib/access/server";
import type { AccessPreviewTargetType, Actor, WorkspaceContext, WorkspaceOption } from "@/lib/access/types";
import { getDemoActor } from "@/lib/demo/access";
import { isDemoMode } from "@/lib/demo/mode";
import { hasCapability } from "@/lib/core/access.mjs";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export const SESSION_COOKIE = "oo_session";
export const DEMO_COOKIE = "oo_demo_role";
export const WORKSPACE_MODE_COOKIE = "oo_workspace_mode";
export const ACCESS_PREVIEW_COOKIE = "oo_access_preview";

type ActorOptions = { ignorePreview?: boolean };

function buildDemoActor(roleCode: string): Actor {
  const actor = getDemoActor(roleCode);
  return {
    ...actor,
    organizationName: "БЕТА · ОПЕРИС Аутсорсинг",
    organizationSlug: "operis-beta",
    baseRoleCode: actor.roleCode,
    baseRoleName: actor.roleName,
    accessPreview: null,
    canAccessPreview: true,
  };
}

export async function getCurrentActor(options: ActorOptions = {}): Promise<Actor | null> {
  if (isGithubPagesDemo()) return buildDemoActor("director");
  const store = await cookies();
  if (store.get(WORKSPACE_MODE_COOKIE)?.value === "demo" && isDemoMode()) {
    return buildDemoActor(store.get(DEMO_COOKIE)?.value ?? "director");
  }
  if (!hasDatabase()) return null;

  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const tokenHash = hashSessionToken(raw);
  const sql = db();
  const [session] = await sql<{ user_id: string; organization_id: string }[]>`
    SELECT user_id,organization_id FROM sessions
    WHERE token_hash=${tokenHash} AND expires_at>now()
    LIMIT 1
  `;
  if (!session) return null;

  return withTenant(session.organization_id, session.user_id, async (tx) => {
    const [row] = await tx<{
      membership_id: string;
      user_id: string;
      organization_id: string;
      organization_name: string;
      organization_slug: string;
      display_name: string;
      email: string;
      role_template_id: string;
      role_code: string;
      role_name: string;
      primary_team_id: string | null;
      position_id: string | null;
      position_name: string | null;
      primary_org_unit_id: string | null;
    }[]>`
      SELECT m.id membership_id,u.id user_id,m.organization_id,o.name organization_name,o.slug organization_slug,
             u.display_name,u.email,r.id role_template_id,r.code role_code,r.name role_name,m.primary_team_id,
             m.position_id,p.name position_name,m.primary_org_unit_id
      FROM organization_memberships m
      JOIN app_users u ON u.id=m.user_id
      JOIN organizations o ON o.id=m.organization_id
      JOIN role_templates r ON r.id=m.role_template_id
      LEFT JOIN positions p ON p.id=m.position_id
      WHERE m.user_id=${session.user_id}::uuid
        AND m.organization_id=${session.organization_id}::uuid
        AND m.status='active'
      LIMIT 1
    `;
    if (!row) return null;

    const teams = await tx<{ team_id: string }[]>`
      SELECT team_id FROM membership_teams WHERE membership_id=${row.membership_id}::uuid
    `;
    const regions = await tx<{ region_id: string }[]>`
      SELECT region_id FROM membership_regions WHERE membership_id=${row.membership_id}::uuid
    `;
    const assignedSeats = await tx<{ job_profile_id: string; organization_unit_id: string; region_id: string | null }[]>`
      SELECT DISTINCT sp.job_profile_id,sp.organization_unit_id,COALESCE(sp.region_id,ou.region_id) region_id
      FROM position_assignments pa
      JOIN staff_positions sp ON sp.id=pa.staff_position_id
      JOIN organization_units ou ON ou.id=sp.organization_unit_id
      WHERE pa.membership_id=${row.membership_id}::uuid
        AND pa.status<>'ended'
        AND pa.effective_from<=current_date
        AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
        AND sp.effective_from<=current_date
        AND (sp.effective_to IS NULL OR sp.effective_to>=current_date)
    `;
    const assignedUnits = await tx<{ organization_unit_id: string }[]>`
      SELECT organization_unit_id FROM membership_organization_units
      WHERE membership_id=${row.membership_id}::uuid
        AND effective_from<=current_date
        AND (effective_to IS NULL OR effective_to>=current_date)
    `;

    const teamIds = [...new Set([row.primary_team_id,...teams.map((item) => item.team_id)].filter(Boolean) as string[])];
    const regionIds = [...new Set([...regions.map((item) => item.region_id),...assignedSeats.map((item) => item.region_id)].filter(Boolean) as string[])];
    const orgUnitIds = [...new Set([row.primary_org_unit_id,...assignedUnits.map((item) => item.organization_unit_id),...assignedSeats.map((item) => item.organization_unit_id)].filter(Boolean) as string[])];
    const positionIds = [...new Set([row.position_id,...assignedSeats.map((item) => item.job_profile_id)].filter(Boolean) as string[])];

    const actualAccess = await loadEffectiveAccess(tx,row.membership_id,row.role_template_id,positionIds,regionIds,orgUnitIds);
    const canAccessPreview = hasCapability(actualAccess,"admin.permissions.manage") || hasCapability(actualAccess,"organization.access.manage");
    let access = actualAccess;
    let roleCode = row.role_code;
    let roleName = row.role_name;
    let accessPreview: Actor["accessPreview"] = null;

    const previewValue = options.ignorePreview ? null : store.get(ACCESS_PREVIEW_COOKIE)?.value;
    if (previewValue && canAccessPreview) {
      const match = /^(role_template|position|process_role):([0-9a-f-]{36})$/i.exec(previewValue);
      if (match) {
        const targetType = match[1] as AccessPreviewTargetType;
        const targetId = match[2];
        const [previewTarget] = targetType === "role_template"
          ? await tx<{ id: string; code: string; name: string }[]>`
              SELECT id,code,name FROM role_templates
              WHERE id=${targetId}::uuid AND organization_id=${row.organization_id}::uuid
              LIMIT 1
            `
          : targetType === "position"
            ? await tx<{ id: string; code: string; name: string }[]>`
                SELECT id,code,name FROM positions
                WHERE id=${targetId}::uuid AND organization_id=${row.organization_id}::uuid AND active=true
                LIMIT 1
              `
            : await tx<{ id: string; code: string; name: string }[]>`
                SELECT id,code,name FROM process_roles
                WHERE id=${targetId}::uuid AND organization_id=${row.organization_id}::uuid AND active=true
                LIMIT 1
              `;
        if (previewTarget) {
          access = await loadPreviewAccess(tx,targetType,previewTarget.id,regionIds,orgUnitIds);
          roleCode = previewTarget.code;
          roleName = previewTarget.name;
          accessPreview = {
            targetType,
            targetId: previewTarget.id,
            code: previewTarget.code,
            name: previewTarget.name,
          };
        }
      }
    }

    return {
      userId: row.user_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      membershipId: row.membership_id,
      displayName: row.display_name,
      email: row.email,
      roleCode,
      roleName,
      baseRoleCode: row.role_code,
      baseRoleName: row.role_name,
      positionId: row.position_id,
      positionName: row.position_name,
      teamIds,
      orgUnitIds,
      regionIds,
      access,
      accessPreview,
      canAccessPreview,
      demo: false,
    } satisfies Actor;
  });
}

async function getRealSessionOrganization(): Promise<WorkspaceOption | null> {
  if (!hasDatabase()) return null;
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const [row] = await db()<{ id: string; name: string; slug: string }[]>`
      SELECT o.id,o.name,o.slug
      FROM sessions s
      JOIN organizations o ON o.id=s.organization_id
      WHERE s.token_hash=${hashSessionToken(raw)} AND s.expires_at>now()
      LIMIT 1
    `;
    return row ? { key: row.id, id: row.id, name: row.name, slug: row.slug, kind: "tenant" } : null;
  } catch {
    return null;
  }
}

export async function getWorkspaceContext(actor: Actor): Promise<WorkspaceContext> {
  if (isGithubPagesDemo()) return {
    organizations: [{ key: "demo", id: null, name: "БЕТА · ОПЕРИС Аутсорсинг", slug: "operis-beta", kind: "demo" }],
    currentOrganizationKey: "demo",
    previewOptions: [],
    previewTarget: null,
    actualRoleName: actor.baseRoleName ?? actor.roleName,
    hasRealSession: false,
  };
  const organizations: WorkspaceOption[] = [];
  if (isDemoMode()) {
    organizations.push({ key: "demo", id: null, name: "Демо-организация", slug: "operis-demo", kind: "demo" });
  }

  const realOrganization = actor.demo
    ? await getRealSessionOrganization()
    : {
        key: actor.organizationId,
        id: actor.organizationId,
        name: actor.organizationName ?? "Моя организация",
        slug: actor.organizationSlug ?? "sergey-work",
        kind: "tenant" as const,
      };
  if (realOrganization && !organizations.some((item) => item.key === realOrganization.key)) {
    organizations.push(realOrganization);
  }

  let previewOptions: WorkspaceContext["previewOptions"] = [];
  if (!actor.demo && actor.canAccessPreview) {
    previewOptions = await withTenant(actor.organizationId,actor.userId,async (tx) => {
      const roles = await tx<{ id: string; code: string; name: string }[]>`
        SELECT id,code,name FROM role_templates
        WHERE organization_id=${actor.organizationId}::uuid
        ORDER BY CASE code
          WHEN 'director' THEN 0
          WHEN 'commercial_lead' THEN 10
          WHEN 'client_manager' THEN 20
          WHEN 'operations_head' THEN 30
          WHEN 'object_manager' THEN 40
          WHEN 'supply_specialist' THEN 50
          WHEN 'recruitment_head' THEN 60
          WHEN 'recruiter' THEN 70
          WHEN 'finance_economist' THEN 80
          ELSE 100
        END,name
      `;
      const positions = await tx<{ id: string; code: string; name: string }[]>`
        SELECT id,code,name FROM positions
        WHERE organization_id=${actor.organizationId}::uuid AND active=true
        ORDER BY name
      `;
      const processRoles = await tx<{ id: string; code: string; name: string }[]>`
        SELECT id,code,name FROM process_roles
        WHERE organization_id=${actor.organizationId}::uuid AND active=true
        ORDER BY name
      `;
      return [
        ...roles.map((item) => ({...item,targetType:"role_template" as const})),
        ...positions.map((item) => ({...item,targetType:"position" as const})),
        ...processRoles.map((item) => ({...item,targetType:"process_role" as const})),
      ];
    });
  }

  return {
    organizations,
    currentOrganizationKey: actor.demo ? "demo" : actor.organizationId,
    previewOptions,
    previewTarget: actor.accessPreview ? `${actor.accessPreview.targetType}:${actor.accessPreview.targetId}` : null,
    actualRoleName: actor.baseRoleName ?? actor.roleName,
    hasRealSession: Boolean(realOrganization),
  };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect("/login");
    throw new Error("redirect");
  }
  return actor;
}

export function hashSessionToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
