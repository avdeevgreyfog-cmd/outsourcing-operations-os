import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import type { CompanyEmployeeRow, CompanyProfile, OrganizationChangeSetRow, OrganizationUnitRow, PositionAssignmentRow, PositionRow, ProcessRoleRow, ResponsibilityRuleRow, StaffPositionRow } from "@/lib/organization/types";
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
  if (actor.demo) return filterUnits(actor,demo.organizationUnits);
  const rows=await withTenant(actor.organizationId, actor.userId, async (sql) => sql<OrganizationUnitRow[]>`
    SELECT ou.id,ou.organization_id "organizationId",ou.parent_id "parentId",ou.region_id "regionId",rg.name region,
      ou.code,ou.name,ou.kind,ou.description,ou.active,ou.sort_order "sortOrder",
      ou.manager_membership_id "managerMembershipId",manager_user.display_name manager,
      count(m.id)::int "employeeCount",
      (SELECT count(*)::int FROM staff_positions sp WHERE sp.organization_unit_id=ou.id AND sp.status<>'closed' AND sp.effective_from<=current_date AND (sp.effective_to IS NULL OR sp.effective_to>=current_date)) "staffPositionCount",
      (SELECT COALESCE(sum(GREATEST(0,sp.capacity-COALESCE((SELECT sum(pa.fte) FROM position_assignments pa WHERE pa.staff_position_id=sp.id AND pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)),0))),0)::float8 FROM staff_positions sp WHERE sp.organization_unit_id=ou.id AND sp.status<>'closed' AND sp.effective_from<=current_date AND (sp.effective_to IS NULL OR sp.effective_to>=current_date)) "vacancyCount",
      (SELECT count(*)::int FROM organization_units child WHERE child.parent_id=ou.id AND child.active) "childCount"
    FROM organization_units ou
    LEFT JOIN regions rg ON rg.id=ou.region_id
    LEFT JOIN organization_memberships manager_membership ON manager_membership.id=ou.manager_membership_id
    LEFT JOIN app_users manager_user ON manager_user.id=manager_membership.user_id
    LEFT JOIN organization_memberships m ON m.primary_org_unit_id=ou.id AND m.status='active'
    GROUP BY ou.id,rg.name,manager_user.display_name
    ORDER BY ou.sort_order,ou.name
  `);return filterUnits(actor,rows);
}

export async function listCompanyEmployees(actor: Actor): Promise<CompanyEmployeeRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return filterEmployees(actor,demo.companyEmployees);
  const rows=await withTenant(actor.organizationId, actor.userId, async (sql) => sql<CompanyEmployeeRow[]>`
    SELECT m.id,u.id "userId",m.organization_id "organizationId",u.display_name name,u.email,m.phone,m.status,
      m.position_id "positionId",p.name position,m.primary_org_unit_id "orgUnitId",ou.name "orgUnit",
      ou.region_id "regionId",rg.name region,m.manager_membership_id "managerMembershipId",manager_user.display_name manager,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'name',pr.name,'code',pr.code) ORDER BY pr.name)
        FROM membership_process_roles mr JOIN process_roles pr ON pr.id=mr.process_role_id
        WHERE mr.membership_id=m.id AND mr.effective_from<=current_date AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)),'[]'::jsonb) roles,
      COALESCE((SELECT array_agg(ra.resource_label ORDER BY ra.resource_label)
        FROM responsibility_assignments ra WHERE ra.membership_id=m.id AND (ra.effective_to IS NULL OR ra.effective_to>=current_date)),'{}'::text[]) responsibilities
      ,(SELECT sp.id FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id
        WHERE pa.membership_id=m.id AND pa.assignment_type='primary' AND pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
        ORDER BY pa.effective_from DESC LIMIT 1) "primaryStaffPositionId"
      ,(SELECT sp.name FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id
        WHERE pa.membership_id=m.id AND pa.assignment_type='primary' AND pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
        ORDER BY pa.effective_from DESC LIMIT 1) "primaryStaffPosition"
      ,(SELECT count(*)::int FROM position_assignments pa WHERE pa.membership_id=m.id AND pa.assignment_type<>'primary' AND pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)) "additionalAssignments"
    FROM organization_memberships m
    JOIN app_users u ON u.id=m.user_id
    LEFT JOIN positions p ON p.id=m.position_id
    LEFT JOIN organization_units ou ON ou.id=m.primary_org_unit_id
    LEFT JOIN regions rg ON rg.id=ou.region_id
    LEFT JOIN organization_memberships manager_membership ON manager_membership.id=m.manager_membership_id
    LEFT JOIN app_users manager_user ON manager_user.id=manager_membership.user_id
    WHERE m.organization_id=${actor.organizationId}::uuid
    ORDER BY u.display_name
  `);return filterEmployees(actor,rows);
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

export async function listStaffPositions(actor: Actor): Promise<StaffPositionRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return filterStaffPositions(actor,demo.staffPositions);
  const rows=await withTenant(actor.organizationId, actor.userId, async (sql) => sql<StaffPositionRow[]>`
    SELECT sp.id,sp.organization_id "organizationId",sp.code,sp.name,sp.job_profile_id "jobProfileId",p.name "jobProfile",
      sp.organization_unit_id "orgUnitId",ou.name "orgUnit",sp.region_id "regionId",rg.name region,
      sp.reports_to_position_id "reportsToPositionId",manager_position.name "reportsToPosition",
      sp.capacity::float8 capacity,sp.level,sp.status,sp.effective_from::text "effectiveFrom",sp.effective_to::text "effectiveTo",
      COALESCE(sum(pa.fte) FILTER (WHERE pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)),0)::float8 occupied,
      GREATEST(0,sp.capacity-COALESCE(sum(pa.fte) FILTER (WHERE pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)),0))::float8 open
    FROM staff_positions sp
    JOIN positions p ON p.id=sp.job_profile_id
    JOIN organization_units ou ON ou.id=sp.organization_unit_id
    LEFT JOIN regions rg ON rg.id=sp.region_id
    LEFT JOIN staff_positions manager_position ON manager_position.id=sp.reports_to_position_id
    LEFT JOIN position_assignments pa ON pa.staff_position_id=sp.id
    WHERE sp.effective_from<=current_date AND (sp.effective_to IS NULL OR sp.effective_to>=current_date)
    GROUP BY sp.id,p.name,ou.name,rg.name,manager_position.name
    ORDER BY sp.level,ou.sort_order,sp.name
  `);return filterStaffPositions(actor,rows);
}

export async function listPositionAssignments(actor: Actor): Promise<PositionAssignmentRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.positionAssignments;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<PositionAssignmentRow[]>`
    SELECT pa.id,pa.organization_id "organizationId",pa.staff_position_id "staffPositionId",pa.membership_id "membershipId",
      u.display_name "employeeName",pa.assignment_type "assignmentType",pa.fte::float8 fte,pa.status,
      pa.effective_from::text "effectiveFrom",pa.effective_to::text "effectiveTo",pa.allow_overallocation "allowOverallocation"
    FROM position_assignments pa
    JOIN organization_memberships m ON m.id=pa.membership_id
    JOIN app_users u ON u.id=m.user_id
    ORDER BY pa.effective_from DESC,u.display_name
  `);
}

export async function listResponsibilityRules(actor: Actor): Promise<ResponsibilityRuleRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.responsibilityRules;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<ResponsibilityRuleRow[]>`
    SELECT rr.id,rr.process_name process,rr.step_name step,rr.responsibility_type "responsibilityType",rr.subject_type "subjectType",
      CASE rr.subject_type
        WHEN 'process_role' THEN (SELECT name FROM process_roles WHERE id=rr.subject_id)
        WHEN 'staff_position' THEN (SELECT name FROM staff_positions WHERE id=rr.subject_id)
        WHEN 'org_unit' THEN (SELECT name FROM organization_units WHERE id=rr.subject_id)
        WHEN 'membership' THEN (SELECT u.display_name FROM organization_memberships m JOIN app_users u ON u.id=m.user_id WHERE m.id=rr.subject_id)
      END "subjectName",
      CASE rr.scope_type WHEN 'all_org' THEN 'Вся компания' WHEN 'org_unit' THEN 'Подразделение' WHEN 'region' THEN 'Регион' WHEN 'objects' THEN 'Назначенные объекты' WHEN 'clients' THEN 'Назначенные клиенты' ELSE 'Собственная зона' END "scopeLabel",
      CASE rr.fallback_subject_type
        WHEN 'process_role' THEN (SELECT name FROM process_roles WHERE id=rr.fallback_subject_id)
        WHEN 'staff_position' THEN (SELECT name FROM staff_positions WHERE id=rr.fallback_subject_id)
        WHEN 'org_unit' THEN (SELECT name FROM organization_units WHERE id=rr.fallback_subject_id)
        WHEN 'membership' THEN (SELECT u.display_name FROM organization_memberships m JOIN app_users u ON u.id=m.user_id WHERE m.id=rr.fallback_subject_id)
      END "fallbackName"
    FROM responsibility_rules rr
    WHERE rr.active AND rr.effective_from<=current_date AND (rr.effective_to IS NULL OR rr.effective_to>=current_date)
    ORDER BY rr.process_name,rr.step_name,rr.responsibility_type
  `);
}

export async function listOrganizationChangeSets(actor: Actor): Promise<OrganizationChangeSetRow[]> {
  requireCapability(actor, "organization.read");
  if (actor.demo) return demo.organizationChangeSets;
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<OrganizationChangeSetRow[]>`
    SELECT cs.id,cs.title,cs.status,cs.effective_date::text "effectiveDate",count(ci.id)::int "itemCount",u.display_name "createdBy"
    FROM organization_change_sets cs
    JOIN app_users u ON u.id=cs.created_by_user_id
    LEFT JOIN organization_change_items ci ON ci.change_set_id=cs.id
    GROUP BY cs.id,u.display_name
    ORDER BY cs.effective_date DESC,cs.created_at DESC
  `);
}

function organizationReadScopes(actor:Actor){return actor.access.scopes["organization.read"]??[]}
function hasAllOrganizationScope(actor:Actor){return actor.access.capabilities.includes("*")||organizationReadScopes(actor).some(scope=>scope.type==="all_org")}
function resolvedIds(actor:Actor,type:"org_unit"|"region"){
  const ids=organizationReadScopes(actor).filter(scope=>scope.type===type).flatMap(scope=>scope.ids);
  return new Set(ids.length?ids:type==="org_unit"?actor.orgUnitIds:actor.regionIds);
}
function filterEmployees(actor:Actor,rows:CompanyEmployeeRow[]){if(hasAllOrganizationScope(actor))return rows;const units=resolvedIds(actor,"org_unit"),regions=resolvedIds(actor,"region"),self=organizationReadScopes(actor).some(scope=>scope.type==="self");return rows.filter(row=>(self&&row.id===actor.membershipId)||(row.orgUnitId&&units.has(row.orgUnitId))||(row.regionId&&regions.has(row.regionId)))}
function filterStaffPositions(actor:Actor,rows:StaffPositionRow[]){if(hasAllOrganizationScope(actor))return rows;const units=resolvedIds(actor,"org_unit"),regions=resolvedIds(actor,"region");return rows.filter(row=>units.has(row.orgUnitId)||(row.regionId&&regions.has(row.regionId)))}
function filterUnits(actor:Actor,rows:OrganizationUnitRow[]){if(hasAllOrganizationScope(actor))return rows;const units=resolvedIds(actor,"org_unit"),regions=resolvedIds(actor,"region"),keep=new Set<string>();for(const row of rows)if(units.has(row.id)||(row.regionId&&regions.has(row.regionId)))keep.add(row.id);let changed=true;while(changed){changed=false;for(const row of rows)if(keep.has(row.id)&&row.parentId&&!keep.has(row.parentId)){keep.add(row.parentId);changed=true}}return rows.filter(row=>keep.has(row.id))}
