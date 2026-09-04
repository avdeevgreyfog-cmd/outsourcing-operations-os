import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { getCurrentActor } from "@/lib/auth/server";
import { withTenant } from "@/lib/db/client";

const createSchema = z.object({
  staffPositionId: z.string().uuid(),
  membershipId: z.string().uuid(),
  assignmentType: z.enum(["primary", "additional", "acting"]),
  fte: z.number().positive().max(1),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  reason: z.string().trim().min(3).max(1000),
  allowOverallocation: z.boolean().default(false),
  replacePrimary: z.boolean().default(false),
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
  message: "Дата окончания раньше даты начала",
  path: ["effectiveTo"],
});

const endSchema = z.object({
  id: z.string().uuid(),
  effectiveTo: z.string().date(),
  reason: z.string().trim().min(3).max(1000),
});

async function authorize() {
  const actor = await getCurrentActor();
  if (!actor) throw new Error("UNAUTHORIZED");
  requireCapability(actor, "organization.employee.manage");
  if (actor.demo) throw new Error("DEMO");
  return actor;
}

export async function POST(request: Request) {
  try {
    const actor = await authorize();
    const body = createSchema.parse(await request.json());
    const [row] = await withTenant(actor.organizationId, actor.userId, async (sql) => {
      const [seat]=await sql.unsafe<Array<{job_profile_id:string;organization_unit_id:string}>>(
        "SELECT job_profile_id,organization_unit_id FROM staff_positions WHERE id=$1::uuid",[body.staffPositionId]
      );
      if(!seat)throw new Error("NOT_FOUND");
      if(body.assignmentType==="primary"&&body.replacePrimary){
        await sql.unsafe(
          `UPDATE position_assignments SET status='ended',effective_to=GREATEST(effective_from,$2::date-1),
            reason=$3,ended_by_user_id=$4::uuid,ended_at=now(),updated_at=now()
           WHERE membership_id=$1::uuid AND assignment_type='primary' AND status<>'ended'
             AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>=$2::date)`,
          [body.membershipId,body.effectiveFrom,`Перевод: ${body.reason}`,actor.userId],
        );
      }
      const inserted=await sql.unsafe<Array<{ id: string }>>(
      `INSERT INTO position_assignments
        (organization_id,staff_position_id,membership_id,assignment_type,fte,effective_from,effective_to,reason,allow_overallocation,created_by_user_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::date,$7::date,$8,$9,$10::uuid)
       RETURNING id`,
      [actor.organizationId, body.staffPositionId, body.membershipId, body.assignmentType, body.fte, body.effectiveFrom, body.effectiveTo ?? null, body.reason, body.allowOverallocation, actor.userId],
      );
      if(body.assignmentType==="primary"&&body.effectiveFrom<=new Date().toISOString().slice(0,10)){
        await sql.unsafe("UPDATE organization_memberships SET position_id=$2::uuid,primary_org_unit_id=$3::uuid,updated_at=now() WHERE id=$1::uuid",[body.membershipId,seat.job_profile_id,seat.organization_unit_id]);
        await sql.unsafe("UPDATE membership_organization_units SET effective_to=GREATEST(effective_from,$3::date-1) WHERE membership_id=$1::uuid AND assignment_type='primary' AND organization_unit_id<>$2::uuid AND effective_to IS NULL",[body.membershipId,seat.organization_unit_id,body.effectiveFrom]);
        await sql.unsafe("INSERT INTO membership_organization_units(organization_id,membership_id,organization_unit_id,assignment_type,effective_from) VALUES($1::uuid,$2::uuid,$3::uuid,'primary',$4::date) ON CONFLICT DO NOTHING",[actor.organizationId,body.membershipId,seat.organization_unit_id,body.effectiveFrom]);
      }
      return inserted;
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (error) {
    return fail(error, "Не удалось создать назначение");
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authorize();
    const body = endSchema.parse(await request.json());
    const rows = await withTenant(actor.organizationId, actor.userId, (sql) => sql.unsafe<Array<{ id: string }>>(
      `UPDATE position_assignments
       SET status='ended',effective_to=$2::date,reason=$3,ended_by_user_id=$4::uuid,ended_at=now(),updated_at=now()
       WHERE id=$1::uuid AND status<>'ended' AND effective_from<=$2::date RETURNING id`,
      [body.id, body.effectiveTo, body.reason, actor.userId],
    ));
    if (!rows.length) throw new Error("NOT_FOUND");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Не удалось завершить назначение");
  }
}

function fail(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте назначение и даты", issues: error.issues }, { status: 400 });
  if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 });
  if (error instanceof Error && error.message === "DEMO") return NextResponse.json({ error: "В демонстрационном режиме изменения не сохраняются" }, { status: 409 });
  if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Активное назначение не найдено" }, { status: 404 });
  if (error instanceof Error && /capacity exceeded|allocation exceeds|overlaps another primary/.test(error.message)) return NextResponse.json({ error: "Назначение пересекается с действующим или превышает доступную занятость" }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
