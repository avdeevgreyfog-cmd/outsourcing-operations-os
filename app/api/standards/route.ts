import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability, AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { getCalculationStandards } from "@/lib/commercial/calculation-standards";

const code = z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/, "Код: латиница, цифры, дефис или подчёркивание");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const expense = z.object({
  kind: z.literal("expense"), action: z.enum(["create", "revise"]).default("create"), code,
  name: z.string().trim().min(2).max(160), groupName: z.string().trim().min(2).max(120), amount: z.coerce.number().min(0),
  base: z.enum(["per_hour","per_shift","per_worker_month","per_worker_period","percent_of_worker_pay","role_month","role_fixed","project_month","project_fixed","per_unit"]),
  scope: z.enum(["worker","role","project"]), amortizationMonths: z.coerce.number().positive().nullable().optional(),
  defaultEnabled: z.boolean().default(false), active: z.boolean().default(true), effectiveFrom: date, effectiveTo: date.nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(),
}).refine(value => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, { message: "Дата окончания не может быть раньше даты начала", path: ["effectiveTo"] });
const schedule = z.object({
  kind: z.literal("schedule"), action: z.enum(["create", "revise"]).default("create"), code,
  name: z.string().trim().min(2).max(160), pattern: z.string().trim().min(1).max(80), shiftHours: z.coerce.number().positive(), breakHours: z.coerce.number().min(0),
  breakPaid: z.boolean().default(false), shiftsPerMonth: z.coerce.number().positive(), active: z.boolean().default(true), effectiveFrom: date, effectiveTo: date.nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(),
}).refine(value => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, { message: "Дата окончания не может быть раньше даты начала", path: ["effectiveTo"] });
const schema = z.discriminatedUnion("kind", [expense, schedule]);

export async function GET(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requireCapability(actor, "calculation.rules.read");
    const date = new URL(request.url).searchParams.get("date");
    return NextResponse.json(await getCalculationStandards(actor, date));
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccessDeniedError ? "Недостаточно прав" : "Не удалось загрузить нормативы" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCapability(actor, "calculation.rules.manage");
    if (actor.demo) return NextResponse.json({ error: "Демо-нормативы доступны только для чтения" }, { status: 409 });
    const body = schema.parse(await request.json());
    const row = await withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
      const [version] = body.kind === "expense"
        ? await tx<Array<{ version: number }>>`SELECT COALESCE(max(version),0)::int+1 version FROM calculation_expense_standard_versions WHERE code=${body.code}`
        : await tx<Array<{ version: number }>>`SELECT COALESCE(max(version),0)::int+1 version FROM calculation_schedule_standard_versions WHERE code=${body.code}`;
      if (body.kind === "expense") {
        const [created] = await tx`
          INSERT INTO calculation_expense_standard_versions(organization_id,code,version,name,group_name,amount,base,scope,amortization_months,default_enabled,active,effective_from,effective_to,notes,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.code},${version.version},${body.name},${body.groupName},${body.amount},${body.base},${body.scope},${body.amortizationMonths ?? null},${body.defaultEnabled},${body.active},${body.effectiveFrom}::date,${body.effectiveTo ?? null}::date,${body.notes ?? null},${actor.userId}::uuid)
          RETURNING id,code,version,name,group_name "groupName",amount::float8 amount,base,scope,amortization_months::float8 "amortizationMonths",default_enabled "defaultEnabled",active,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",notes
        `;
        return created;
      }
      const [created] = await tx`
        INSERT INTO calculation_schedule_standard_versions(organization_id,code,version,name,pattern,shift_hours,break_hours,break_paid,shifts_per_month,active,effective_from,effective_to,notes,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.code},${version.version},${body.name},${body.pattern},${body.shiftHours},${body.breakHours},${body.breakPaid},${body.shiftsPerMonth},${body.active},${body.effectiveFrom}::date,${body.effectiveTo ?? null}::date,${body.notes ?? null},${actor.userId}::uuid)
        RETURNING id,code,version,name,pattern,shift_hours::float8 "shiftHours",break_hours::float8 "breakHours",break_paid "breakPaid",shifts_per_month::float8 "shiftsPerMonth",active,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",notes
      `;
      return created;
    }));
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте поля норматива", issues: error.issues }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить норматив" }, { status: 500 });
  }
}
