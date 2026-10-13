import { NextResponse } from "next/server";
import { AccessDeniedError, requireCapability,loadEffectiveAccess,loadMembershipAccessContext } from "@/lib/access/server";
import { getCurrentActor } from "@/lib/auth/server";
import { withTenant } from "@/lib/db/client";
import { OWNER_SYSTEM_CAPABILITIES } from "@/lib/access/system";
import {canReadCompanyEmployee} from "@/lib/organization/read-scope.mjs";

type AccessItem={
  capability:string;
  label:string;
  effect:"allow"|"deny";
  scopeType:string|null;
  scopeIds:string[];
  sourceType:string;
  sourceName:string;
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 });
    requireCapability(actor, "organization.read");
    const { id } = await context.params;
    if (actor.demo) return NextResponse.json({ items: [], effective: [] });

    const result = await withTenant(actor.organizationId, actor.userId, async (sql) => {
      const [target] = await sql<Array<{id:string;userId:string;organizationId:string;orgUnitId:string|null;regionId:string|null;positionId:string|null;primaryOrgUnitId:string|null;roleTemplateId: string; isOwner:boolean }>>`
        SELECT m.id,m.user_id "userId",m.organization_id "organizationId",m.position_id "positionId",m.primary_org_unit_id "primaryOrgUnitId",
               COALESCE(primary_seat.org_unit_id,m.primary_org_unit_id) "orgUnitId",COALESCE(primary_seat.region_id,ou.region_id) "regionId",
               m.role_template_id "roleTemplateId",
               EXISTS(SELECT 1 FROM organization_owners oo WHERE oo.membership_id=m.id) "isOwner"
        FROM organization_memberships m
        LEFT JOIN organization_units ou ON ou.id=m.primary_org_unit_id
        LEFT JOIN LATERAL (
          SELECT sp.organization_unit_id org_unit_id,COALESCE(sp.region_id,sou.region_id) region_id
          FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id
          JOIN organization_units sou ON sou.id=sp.organization_unit_id
          WHERE pa.membership_id=m.id AND pa.assignment_type='primary' AND pa.status<>'ended'
            AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
          ORDER BY pa.effective_from DESC,pa.created_at DESC LIMIT 1
        ) primary_seat ON true
        WHERE m.id=${id}::uuid
      `;
      if (!target) throw new Error("NOT_FOUND");
      if(!canReadCompanyEmployee(actor,target))throw new AccessDeniedError("organization.read");
      const context=await loadMembershipAccessContext(sql,id,target.positionId,target.primaryOrgUnitId);

      const inherited=await sql<AccessItem[]>`
        SELECT g.capability,COALESCE(d.description,g.capability) label,g.effect,g.scope_type "scopeType",g.scope_ids "scopeIds",'role_template' "sourceType",rt.name "sourceName"
        FROM permission_grants g JOIN role_templates rt ON rt.id=g.role_template_id LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE g.role_template_id=${target.roleTemplateId}::uuid
        UNION ALL
        SELECT g.capability,COALESCE(d.description,g.capability),g.effect,g.scope_type,g.scope_ids,'job_profile',p.name
        FROM position_permission_grants g JOIN positions p ON p.id=g.position_id LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE g.position_id=ANY(${context.positionIds}::uuid[])
        UNION ALL
        SELECT g.capability,COALESCE(d.description,g.capability),g.effect,g.scope_type,g.scope_ids,'process_role',pr.name
        FROM membership_process_roles mr JOIN process_roles pr ON pr.id=mr.process_role_id JOIN process_role_permission_grants g ON g.process_role_id=pr.id
        LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE mr.membership_id=${id}::uuid AND mr.effective_from<=current_date AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)
        UNION ALL
        SELECT o.capability,COALESCE(d.description,o.capability),o.effect,o.scope_type,o.scope_ids,'individual','Индивидуальное исключение'
        FROM user_permission_overrides o LEFT JOIN permission_definitions d ON d.capability=o.capability
        WHERE o.membership_id=${id}::uuid AND (o.effective_from IS NULL OR o.effective_from<=current_date) AND (o.effective_to IS NULL OR o.effective_to>=current_date)
        UNION ALL
        SELECT sg.capability,COALESCE(d.description,sg.capability),'allow','all_org','{}'::uuid[],'system_admin','Системное полномочие'
        FROM membership_system_grants sg LEFT JOIN permission_definitions d ON d.capability=sg.capability
        WHERE sg.membership_id=${id}::uuid AND sg.valid_from<=now() AND (sg.valid_to IS NULL OR sg.valid_to>now())
        ORDER BY capability,"sourceType"
      `;

      const ownerItems=target.isOwner?await sql.unsafe<AccessItem[]>(
        `SELECT d.capability,COALESCE(d.description,d.capability) label,'allow' effect,'all_org' "scopeType",'{}'::uuid[] "scopeIds",'owner' "sourceType",'Владелец организации' "sourceName"
         FROM permission_definitions d
         WHERE d.capability=ANY($1::text[])
         ORDER BY d.capability`,
        [[...OWNER_SYSTEM_CAPABILITIES]],
      ):[];
      const items=[...inherited,...ownerItems];
      const access=await loadEffectiveAccess(sql,id,target.roleTemplateId,context.positionIds,context.regionIds,context.orgUnitIds);
      const effective=[...new Set([...items.map(item=>item.capability),...access.capabilities,...access.denies])].map(capability=>{
      const sources=items.filter(item=>item.capability===capability);
      const allowed=access.capabilities.includes(capability)&&!access.denies.includes(capability);
      const scopes=allowed?(access.scopes[capability]??[]):[];
      return {
        capability,
        label:sources[0]?.label??capability,
        effect:allowed?"allow":"deny",
        scopeTypes:[...new Set(scopes.map(scope=>scope.type))],
        scopeIds:[...new Set(scopes.flatMap(scope=>scope.ids))],
        sources:sources.length,
      };
      });
      return {items,effective};
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось получить происхождение прав" }, { status: 500 });
  }
}
