import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability, AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { getCalculationStandards } from "@/lib/commercial/calculation-standards";

const code = z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/, "Код: латиница, цифры, дефис или подчёркивание");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const expense = z.object({
  kind: z.literal("expense"), action: z.enum(["create", "revise", "archive"]).default("create"), code,
  name: z.string().trim().min(2).max(160), groupName: z.string().trim().min(2).max(120), amount: z.coerce.number().min(0),
  base: z.enum(["per_hour","per_shift","per_worker_month","per_worker_period","percent_of_worker_pay","role_month","role_fixed","project_month","project_fixed","per_unit"]),
  scope: z.enum(["worker","role","project"]), amortizationMonths: z.coerce.number().positive().nullable().optional(),
  defaultEnabled: z.boolean().default(false), active: z.boolean().default(true), effectiveFrom: date, effectiveTo: date.nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(),
}).refine(value => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, { message: "Дата окончания не может быть раньше даты начала", path: ["effectiveTo"] });
const schedule = z.object({
  kind: z.literal("schedule"), action: z.enum(["create", "revise", "archive"]).default("create"), code,
  name: z.string().trim().min(2).max(160), pattern: z.string().trim().min(1).max(80), shiftHours: z.coerce.number().positive(), breakHours: z.coerce.number().min(0),
  breakPaid: z.boolean().default(false), shiftsPerMonth: z.coerce.number().positive(), active: z.boolean().default(true), effectiveFrom: date, effectiveTo: date.nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(),
}).refine(value => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, { message: "Дата окончания не может быть раньше даты начала", path: ["effectiveTo"] });
const modelRules = z.object({
  mandatoryChargePct:z.coerce.number().min(0).max(100).default(0), mandatoryChargeFixedHourly:z.coerce.number().min(0).default(0),
  riskReservePct:z.coerce.number().min(0).max(100).default(0), minimumMarginPct:z.coerce.number().min(0).max(95).default(0), recommendedMarginPct:z.coerce.number().min(0).max(95).default(0),
  vatPct:z.coerce.number().min(0).max(100).default(0), roundingStep:z.coerce.number().positive().default(1), legalParametersVerified:z.boolean().default(false),
  payStructure:z.enum(["full_pay","mrot_plus_supplement"]).default("full_pay"), officialBasePerWorkerMonthly:z.coerce.number().min(0).default(0),
  mandatoryChargeBase:z.enum(["full_pay","official_base"]).default("full_pay"), supplementCommissionPct:z.coerce.number().min(0).max(100).default(0), supplementCommissionFixedPerWorkerMonthly:z.coerce.number().min(0).default(0),
  notes:z.string().trim().max(1000).optional(),
});
const model = z.object({
  kind:z.literal("model"), action:z.enum(["create","revise","archive"]), modelId:z.string().uuid().optional(), code,
  name:z.string().trim().min(2).max(160), modelType:z.enum(["employment","gph","npd","custom"]).default("custom"), active:z.boolean().default(true),
  effectiveFrom:date, effectiveTo:date.nullable().optional(), source:z.string().trim().max(1000).nullable().optional(), rules:modelRules,
}).superRefine((value,ctx)=>{ if(value.action!=="create"&&!value.modelId)ctx.addIssue({code:"custom",message:"Не указана модель для изменения",path:["modelId"]}); if(value.effectiveTo&&value.effectiveTo<value.effectiveFrom)ctx.addIssue({code:"custom",message:"Дата окончания не может быть раньше даты начала",path:["effectiveTo"]}); });
const policyValues = z.object({
  minimumMarginPct:z.coerce.number().min(0).max(95), recommendedMarginPct:z.coerce.number().min(0).max(95), riskReservePct:z.coerce.number().min(0).max(100),
  vatPct:z.coerce.number().min(0).max(100), roundingStep:z.coerce.number().positive(), approvalBelowMarginPct:z.coerce.number().min(0).max(95), notes:z.string().trim().max(1500).default(""),
});
const policy = z.object({ kind:z.literal("policy"), action:z.literal("revise"), effectiveFrom:date, effectiveTo:date.nullable().optional(), policy:policyValues })
  .refine(value=>!value.effectiveTo||value.effectiveTo>=value.effectiveFrom,{message:"Дата окончания не может быть раньше даты начала",path:["effectiveTo"]});
const schema = z.discriminatedUnion("kind", [expense, schedule, model, policy]);

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
    if (actor.demo) return NextResponse.json({ error: "Демо-нормативы сохраняются в браузере" }, { status: 409 });
    const body = schema.parse(await request.json());
    const row = await withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
      if(body.kind === "policy"){
        const [version]=await tx<Array<{version:number}>>`SELECT COALESCE(max(version),0)::int+1 version FROM commercial_policy_versions`;
        const [created]=await tx`
          INSERT INTO commercial_policy_versions(organization_id,version,effective_from,effective_to,policy_json,notes,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${version.version},${body.effectiveFrom}::date,${body.effectiveTo??null}::date,${tx.json(body.policy)},${body.policy.notes||null},${actor.userId}::uuid)
          RETURNING id,version,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",policy_json policy
        `;
        return {kind:"policy",...created};
      }
      if(body.kind === "model"){
        let modelId=body.modelId;
        if(body.action === "create"){
          const [createdModel]=await tx<Array<{id:string}>>`
            INSERT INTO calculation_models(organization_id,code,name,model_type,active,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${body.code},${body.name},${body.modelType},${body.active},${actor.userId}::uuid) RETURNING id
          `; modelId=createdModel.id;
        }else if(body.action === "archive"){
          const existingModelId=modelId as string;
          await tx`UPDATE calculation_models SET active=false WHERE id=${existingModelId}::uuid`;
          return {id:existingModelId,code:body.code,name:body.name,active:false,archived:true};
        }else{
          const existingModelId=modelId as string;
          await tx`UPDATE calculation_models SET name=${body.name},model_type=${body.modelType},active=${body.active} WHERE id=${existingModelId}::uuid`;
        }
        const resolvedModelId=modelId as string;
        const [version]=await tx<Array<{version:number}>>`SELECT COALESCE(max(version),0)::int+1 version FROM calculation_rule_versions WHERE calculation_model_id=${resolvedModelId}::uuid`;
        const [created]=await tx`
          INSERT INTO calculation_rule_versions(organization_id,calculation_model_id,version,effective_from,effective_to,rules_json,source,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${resolvedModelId}::uuid,${version.version},${body.effectiveFrom}::date,${body.effectiveTo??null}::date,${tx.json(body.rules)},${body.source??null},${actor.userId}::uuid)
          RETURNING id "ruleVersionId",version "ruleVersion",effective_from::text "ruleEffectiveFrom",effective_to::text "ruleEffectiveTo",rules_json rules,source "ruleSource"
        `;
        return {id:resolvedModelId,code:body.code,name:body.name,modelType:body.modelType,active:body.active,...created};
      }
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
