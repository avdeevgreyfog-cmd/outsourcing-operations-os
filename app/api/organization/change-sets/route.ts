import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { getCurrentActor } from "@/lib/auth/server";
import { withTenant } from "@/lib/db/client";

const createSchema = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(2000).optional(), effectiveDate: z.string().date() });
const transitionSchema = z.object({ id: z.string().uuid(), action: z.enum(["submit", "approve", "schedule", "apply", "cancel"]) });
const transitions: Record<string, Record<string, string>> = { draft: { submit: "review", cancel: "cancelled" }, review: { approve: "approved", cancel: "cancelled" }, approved: { schedule: "scheduled", apply: "applied", cancel: "cancelled" }, scheduled: { apply: "applied", cancel: "cancelled" } };

async function actor() { const value = await getCurrentActor(); if (!value) throw new Error("UNAUTHORIZED"); requireCapability(value, "organization.unit.manage"); if (value.demo) throw new Error("DEMO"); return value; }

export async function POST(request: Request) {
  try { const current = await actor(); const body = createSchema.parse(await request.json()); const [row] = await withTenant(current.organizationId, current.userId, (sql) => sql<Array<{ id: string }>>`INSERT INTO organization_change_sets(organization_id,title,description,effective_date,created_by_user_id) VALUES(${current.organizationId}::uuid,${body.title},${body.description ?? null},${body.effectiveDate}::date,${current.userId}::uuid) RETURNING id`); return NextResponse.json({ ok: true, id: row.id }, { status: 201 }); }
  catch (error) { return fail(error, "Не удалось создать пакет изменений"); }
}

export async function PATCH(request: Request) {
  try {
    const current = await actor(); const body = transitionSchema.parse(await request.json());
    await withTenant(current.organizationId, current.userId, async (sql) => {
      const [changeSet] = await sql<Array<{ status: string; effectiveDate: string }>>`SELECT status,effective_date::text "effectiveDate" FROM organization_change_sets WHERE id=${body.id}::uuid FOR UPDATE`;
      if (!changeSet) throw new Error("NOT_FOUND"); const next = transitions[changeSet.status]?.[body.action]; if (!next) throw new Error("INVALID_TRANSITION");
      if (body.action === "apply") {
        const [unsupported] = await sql<Array<{ count: number }>>`SELECT count(*)::int count FROM organization_change_items WHERE change_set_id=${body.id}::uuid AND NOT ((entity_type='organization_unit' AND change_type IN ('create','move','update','close')) OR (entity_type='staff_position' AND change_type IN ('create','move','update','close')) OR (entity_type='position_assignment' AND change_type IN ('assign','unassign')))`;
        if (unsupported.count) throw new Error("UNSUPPORTED_ITEMS");
        await sql`INSERT INTO organization_units(id,organization_id,parent_id,region_id,manager_membership_id,code,name,kind,description,active,sort_order)
          SELECT ci.entity_id,${current.organizationId}::uuid,(ci.proposed_value->>'parentId')::uuid,(ci.proposed_value->>'regionId')::uuid,(ci.proposed_value->>'managerMembershipId')::uuid,ci.proposed_value->>'code',ci.proposed_value->>'name',ci.proposed_value->>'kind',ci.proposed_value->>'description',COALESCE((ci.proposed_value->>'active')::boolean,true),COALESCE((ci.proposed_value->>'sortOrder')::int,100)
          FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='organization_unit' AND ci.change_type='create'
          ON CONFLICT (id) DO NOTHING`;
        await sql`UPDATE organization_units ou SET parent_id=COALESCE((ci.proposed_value->>'parentId')::uuid,ou.parent_id),manager_membership_id=COALESCE((ci.proposed_value->>'managerMembershipId')::uuid,ou.manager_membership_id),name=COALESCE(ci.proposed_value->>'name',ou.name),active=CASE WHEN ci.change_type='close' THEN false ELSE COALESCE((ci.proposed_value->>'active')::boolean,ou.active) END,updated_at=now() FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='organization_unit' AND ci.entity_id=ou.id`;
        await sql`INSERT INTO staff_positions(id,organization_id,code,name,job_profile_id,organization_unit_id,region_id,reports_to_position_id,capacity,level,status,effective_from,effective_to,created_by_user_id)
          SELECT ci.entity_id,${current.organizationId}::uuid,ci.proposed_value->>'code',ci.proposed_value->>'name',(ci.proposed_value->>'jobProfileId')::uuid,(ci.proposed_value->>'organizationUnitId')::uuid,(ci.proposed_value->>'regionId')::uuid,(ci.proposed_value->>'reportsToPositionId')::uuid,COALESCE((ci.proposed_value->>'capacity')::numeric,1),COALESCE((ci.proposed_value->>'level')::int,0),COALESCE(ci.proposed_value->>'status','open'),COALESCE((ci.proposed_value->>'effectiveFrom')::date,${changeSet.effectiveDate}::date),(ci.proposed_value->>'effectiveTo')::date,${current.userId}::uuid
          FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='staff_position' AND ci.change_type='create'
          ON CONFLICT (id) DO NOTHING`;
        await sql`UPDATE staff_positions sp SET organization_unit_id=COALESCE((ci.proposed_value->>'organizationUnitId')::uuid,sp.organization_unit_id),reports_to_position_id=COALESCE((ci.proposed_value->>'reportsToPositionId')::uuid,sp.reports_to_position_id),name=COALESCE(ci.proposed_value->>'name',sp.name),capacity=COALESCE((ci.proposed_value->>'capacity')::numeric,sp.capacity),status=CASE WHEN ci.change_type='close' THEN 'closed' ELSE COALESCE(ci.proposed_value->>'status',sp.status) END,effective_to=CASE WHEN ci.change_type='close' THEN ${changeSet.effectiveDate}::date ELSE COALESCE((ci.proposed_value->>'effectiveTo')::date,sp.effective_to) END,updated_at=now() FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='staff_position' AND ci.entity_id=sp.id AND ci.change_type<>'create'`;
        await sql`INSERT INTO position_assignments(id,organization_id,staff_position_id,membership_id,assignment_type,fte,status,effective_from,effective_to,reason,allow_overallocation,created_by_user_id)
          SELECT ci.entity_id,${current.organizationId}::uuid,(ci.proposed_value->>'staffPositionId')::uuid,(ci.proposed_value->>'membershipId')::uuid,COALESCE(ci.proposed_value->>'assignmentType','primary'),COALESCE((ci.proposed_value->>'fte')::numeric,1),'active',COALESCE((ci.proposed_value->>'effectiveFrom')::date,${changeSet.effectiveDate}::date),(ci.proposed_value->>'effectiveTo')::date,COALESCE(ci.proposed_value->>'reason','Пакет изменения структуры'),COALESCE((ci.proposed_value->>'allowOverallocation')::boolean,false),${current.userId}::uuid
          FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='position_assignment' AND ci.change_type='assign'
          ON CONFLICT (id) DO NOTHING`;
        await sql`UPDATE position_assignments pa SET status='ended',effective_to=${changeSet.effectiveDate}::date,reason=COALESCE(ci.proposed_value->>'reason','Пакет изменения структуры'),ended_by_user_id=${current.userId}::uuid,ended_at=now(),updated_at=now() FROM organization_change_items ci WHERE ci.change_set_id=${body.id}::uuid AND ci.entity_type='position_assignment' AND ci.change_type='unassign' AND ci.entity_id=pa.id`;
      }
      await sql`UPDATE organization_change_sets SET status=${next},approved_by_user_id=CASE WHEN ${body.action}='approve' THEN ${current.userId}::uuid ELSE approved_by_user_id END,updated_at=now() WHERE id=${body.id}::uuid`;
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error, "Не удалось изменить статус пакета"); }
}

function fail(error: unknown, fallback: string) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте данные пакета", issues: error.issues }, { status: 400 }); if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }); if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 }); if (error instanceof Error && error.message === "DEMO") return NextResponse.json({ error: "В демонстрационном режиме изменения не сохраняются" }, { status: 409 }); if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Пакет не найден" }, { status: 404 }); if (error instanceof Error && error.message === "INVALID_TRANSITION") return NextResponse.json({ error: "Переход из текущего статуса недоступен" }, { status: 409 }); if (error instanceof Error && error.message === "UNSUPPORTED_ITEMS") return NextResponse.json({ error: "Пакет содержит неподдерживаемые операции и не может быть применён автоматически" }, { status: 409 }); console.error(error); return NextResponse.json({ error: fallback }, { status: 500 }); }
