import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import type { CompanyEmployeeRow, CompanyProfile, OrganizationUnitRow, PositionRow, ProcessRoleRow } from "@/lib/organization/types";
import * as demo from "@/lib/demo/organization";

export async function getCompanyProfile(actor: Actor): Promise<CompanyProfile> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.companyProfile;
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [organization] = await sql<Array<{id:string;name:string;slug:string}>>`
      SELECT id,name,slug FROM organizations WHERE id=${actor.organizationId}::uuid
    `;
    const legalEntities = await sql<Array<{id:string;name:string;shortName:string|null;inn:string|null;primary:boolean}>>`
      SELECT id,name,short_name "shortName",inn,is_primary "primary"
      FROM legal_entities WHERE active ORDER BY is_primary DESC,name
    `;
    const regions = await sql<Array<{id:string;name:string;code:string}>>`SELECT id,name,code FROM regions ORDER BY name`;
    const directions = await sql<Array<{name:string}>>`SELECT name FROM organization_units WHERE kind='direction' AND active ORDER BY sort_order,name`;
    return { ...organization, legalEntities, regions, directions: directions.map((item) => item.name) };
  });
}

export async function listOrganizationUnits(actor: Actor): Promise<OrganizationUnitRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.organizationUnits;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<OrganizationUnitRow[]>`
    SELECT ou.id,ou.organization_id "organizationId",ou.parent_id "parentId",ou.region_id "regionId",rg.name region,
      ou.code,ou.name,ou.kind,ou.description,ou.active,ou.sort_order "sortOrder",
      ou.manager_membership_id "managerMembershipId",manager_user.display_name manager,
      count(m.id)::int "employeeCount"
    FROM organization_units ou
    LEFT JOIN regions rg ON rg.id=ou.region_id
    LEFT JOIN organization_memberships manager_membership ON manager_membership.id=ou.manager_membership_id
    LEFT JOIN app_users manager_user ON manager_user.id=manager_membership.user_id
    LEFT JOIN organization_memberships m ON m.primary_org_unit_id=ou.id AND m.status='active'
    GROUP BY ou.id,rg.name,manager_user.display_name
    ORDER BY ou.sort_order,ou.name
  `);
}

export async function listCompanyEmployees(actor: Actor): Promise<CompanyEmployeeRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.companyEmployees;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<CompanyEmployeeRow[]>`
    SELECT m.id,u.id "userId",m.organization_id "organizationId",u.display_name name,u.email,m.phone,m.status,
      m.position_id "positionId",p.name position,m.primary_org_unit_id "orgUnitId",ou.name "orgUnit",
      ou.region_id "regionId",rg.name region,m.manager_membership_id "managerMembershipId",manager_user.display_name manager,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'name',pr.name,'code',pr.code) ORDER BY pr.name)
        FROM membership_process_roles mr JOIN process_roles pr ON pr.id=mr.process_role_id
        WHERE mr.membership_id=m.id AND mr.effective_from<=current_date AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)),'[]'::jsonb) roles,
      COALESCE((SELECT array_agg(ra.resource_label ORDER BY ra.resource_label)
        FROM responsibility_assignments ra WHERE ra.membership_id=m.id AND (ra.effective_to IS NULL OR ra.effective_to>=current_date)),'{}'::text[]) responsibilities
    FROM organization_memberships m
    JOIN app_users u ON u.id=m.user_id
    LEFT JOIN positions p ON p.id=m.position_id
    LEFT JOIN organization_units ou ON ou.id=m.primary_org_unit_id
    LEFT JOIN regions rg ON rg.id=ou.region_id
    LEFT JOIN organization_memberships manager_membership ON manager_membership.id=m.manager_membership_id
    LEFT JOIN app_users manager_user ON manager_user.id=manager_membership.user_id
    WHERE m.organization_id=${actor.organizationId}::uuid
    ORDER BY u.display_name
  `);
}

export async function listPositions(actor: Actor): Promise<PositionRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.positions;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<PositionRow[]>`
    SELECT p.id,p.organization_id "organizationId",p.code,p.name,p.description,p.purpose,p.duties,p.responsibilities,
      p.process_participation processes,p.active,count(DISTINCT m.id)::int "employeeCount",count(DISTINCT g.id)::int "capabilityCount"
    FROM positions p
    LEFT JOIN organization_memberships m ON m.position_id=p.id AND m.status='active'
    LEFT JOIN position_permission_grants g ON g.position_id=p.id AND g.effect='allow'
    GROUP BY p.id ORDER BY p.active DESC,p.name
  `);
}

export async function listProcessRoles(actor: Actor): Promise<ProcessRoleRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.processRoles;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<ProcessRoleRow[]>`
    SELECT pr.id,pr.organization_id "organizationId",pr.code,pr.name,pr.description,pr.responsibility,pr.active,
      count(DISTINCT mr.membership_id)::int "employeeCount",count(DISTINCT g.id)::int "capabilityCount"
    FROM process_roles pr
    LEFT JOIN membership_process_roles mr ON mr.process_role_id=pr.id AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)
    LEFT JOIN process_role_permission_grants g ON g.process_role_id=pr.id AND g.effect='allow'
    GROUP BY pr.id ORDER BY pr.active DESC,pr.name
  `);
}
