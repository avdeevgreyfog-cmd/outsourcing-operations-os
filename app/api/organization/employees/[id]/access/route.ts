import { NextResponse } from "next/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { getCurrentActor } from "@/lib/auth/server";
import { withTenant } from "@/lib/db/client";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 });
    requireCapability(actor, "organization.read");
    const { id } = await context.params;
    if (actor.demo) return NextResponse.json({ items: [] });
    const items = await withTenant(actor.organizationId, actor.userId, async (sql) => {
      const [target] = await sql<Array<{ roleTemplateId: string }>>`
        SELECT role_template_id "roleTemplateId" FROM organization_memberships WHERE id=${id}::uuid
      `;
      if (!target) throw new Error("NOT_FOUND");
      return sql<Array<{ capability: string; label: string; effect: string; scopeType: string | null; scopeIds: string[]; sourceType: string; sourceName: string }>>`
        SELECT g.capability,COALESCE(d.description,g.capability) label,g.effect,g.scope_type "scopeType",g.scope_ids "scopeIds",'role_template' "sourceType",rt.name "sourceName"
        FROM permission_grants g JOIN role_templates rt ON rt.id=g.role_template_id LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE g.role_template_id=${target.roleTemplateId}::uuid
        UNION ALL
        SELECT g.capability,COALESCE(d.description,g.capability),g.effect,g.scope_type,g.scope_ids,'job_profile',p.name
        FROM position_assignments pa JOIN staff_positions sp ON sp.id=pa.staff_position_id JOIN positions p ON p.id=sp.job_profile_id
        JOIN position_permission_grants g ON g.position_id=p.id LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE pa.membership_id=${id}::uuid AND pa.status<>'ended' AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
        UNION ALL
        SELECT g.capability,COALESCE(d.description,g.capability),g.effect,g.scope_type,g.scope_ids,'process_role',pr.name
        FROM membership_process_roles mr JOIN process_roles pr ON pr.id=mr.process_role_id JOIN process_role_permission_grants g ON g.process_role_id=pr.id
        LEFT JOIN permission_definitions d ON d.capability=g.capability
        WHERE mr.membership_id=${id}::uuid AND mr.effective_from<=current_date AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)
        UNION ALL
        SELECT o.capability,COALESCE(d.description,o.capability),o.effect,o.scope_type,o.scope_ids,'individual','Индивидуальное исключение'
        FROM user_permission_overrides o LEFT JOIN permission_definitions d ON d.capability=o.capability
        WHERE o.membership_id=${id}::uuid AND (o.effective_from IS NULL OR o.effective_from<=current_date) AND (o.effective_to IS NULL OR o.effective_to>=current_date)
        ORDER BY capability,"sourceType"
      `;
    });
    const effective=[...new Set(items.map(item=>item.capability))].map(capability=>{const sources=items.filter(item=>item.capability===capability);const denied=sources.some(item=>item.effect==="deny");return {capability,label:sources[0]?.label??capability,effect:denied?"deny":"allow",scopeTypes:[...new Set(sources.filter(item=>item.effect==="allow").map(item=>item.scopeType).filter(Boolean))],scopeIds:[...new Set(sources.filter(item=>item.effect==="allow").flatMap(item=>item.scopeIds))],sources:sources.length}});
    return NextResponse.json({ items, effective });
  } catch (error) {
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось получить происхождение прав" }, { status: 500 });
  }
}
