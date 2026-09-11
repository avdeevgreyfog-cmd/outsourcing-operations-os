import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const nullableNumber = z.number().finite().nonnegative().nullable().optional();
const rateRow = z.object({
  specialty: z.string().trim().min(1).max(180),
  region: z.string().trim().max(180).optional().default(""),
  priceZone: z.string().trim().max(180).nullable().optional(),
  employmentModel: z.string().trim().max(120).optional().default("Не указано"),
  amountMin: nullableNumber, amountMax: nullableNumber,
  unit: z.string().trim().max(40).optional().default("hour"),
  grossNet: z.string().trim().max(60).optional().default("На руки"),
  source: z.string().trim().max(500).optional().default("Импорт компании"),
  sourceType: z.enum(["manual","import","calculation","proposal","object","reference"]).optional().default("import"),
  sourceStatus: z.string().trim().max(80).optional().default("historical"),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.string().trim().max(60).optional().default("imported"),
  comment: z.string().trim().max(1500).nullable().optional(),
  scheduleLabel: z.string().trim().max(160).nullable().optional(),
  housingIncluded: z.boolean().nullable().optional(),
  shuttleIncluded: z.boolean().nullable().optional(),
  fullCostMin: nullableNumber, fullCostMax: nullableNumber,
  clientRateMin: nullableNumber, clientRateMax: nullableNumber,
  marginMin: nullableNumber, marginMax: nullableNumber,
}).refine(row => row.amountMin != null || row.amountMax != null || row.clientRateMin != null || row.clientRateMax != null, { message:"Нужна хотя бы одна ставка" });
const schema = z.object({ rows: z.array(rateRow).min(1).max(5000) });

function stableCode(prefix: string, value: string) {
  let hash = 2166136261;
  for (let i=0;i<value.length;i+=1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash,16777619); }
  return `${prefix}_${(hash>>>0).toString(16)}`;
}
function unit(value: string) {
  const raw=value.toLowerCase();
  if (["shift","смена","₽/смену"].includes(raw)) return "shift";
  if (["month","месяц","мес","₽/мес"].includes(raw)) return "month";
  return "hour";
}
function paySemantics(value: string) { return /gross|брутто|до вычета/i.test(value) ? "gross" : "net"; }

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"calculation.rate_reference.edit");
    if (actor.demo) return NextResponse.json({error:"В демо-контуре импорт сохраняется в браузере"},{status:409});
    const body = schema.parse(await request.json());
    const created = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      const result: Array<Record<string,unknown>> = [];
      for (const row of body.rows) {
        let [specialty] = await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE lower(name)=lower(${row.specialty}) LIMIT 1`;
        if (!specialty) [specialty] = await tx<Array<{id:string}>>`
          INSERT INTO specialties(organization_id,code,name,aliases,active)
          VALUES(${actor.organizationId}::uuid,${stableCode("import",row.specialty)},${row.specialty},'{}',true)
          ON CONFLICT (organization_id,code) DO UPDATE SET name=EXCLUDED.name
          RETURNING id
        `;
        let regionId: string | null = null;
        if (row.region) {
          let [region] = await tx<Array<{id:string}>>`SELECT id FROM regions WHERE lower(name)=lower(${row.region}) LIMIT 1`;
          if (!region) [region] = await tx<Array<{id:string}>>`
            INSERT INTO regions(organization_id,code,name)
            VALUES(${actor.organizationId}::uuid,${stableCode("region",row.region)},${row.region})
            ON CONFLICT (organization_id,code) DO UPDATE SET name=EXCLUDED.name
            RETURNING id
          `;
          regionId=region.id;
        }
        const priceZone = row.priceZone ?? (row.region || null);
        const [inserted] = await tx<Array<{id:string}>>`
          INSERT INTO rate_reference_entries(
            organization_id,specialty_id,region_id,employment_model,amount_min,amount_max,unit,pay_semantics,source,source_date,confidence,notes,valid_from,valid_to,created_by_user_id,
            price_zone,schedule_label,housing_included,shuttle_included,full_cost_min,full_cost_max,client_rate_min,client_rate_max,margin_min,margin_max,source_type,source_status,conditions_json
          ) VALUES(
            ${actor.organizationId}::uuid,${specialty.id}::uuid,${regionId}::uuid,${row.employmentModel},${row.amountMin??row.amountMax??null},${row.amountMax??row.amountMin??null},${unit(row.unit)},${paySemantics(row.grossNet)},
            ${row.source},${row.sourceDate}::date,${row.confidence},${row.comment??null},${row.sourceDate}::date,NULL,${actor.userId}::uuid,
            ${priceZone},${row.scheduleLabel??null},${row.housingIncluded??null},${row.shuttleIncluded??null},${row.fullCostMin??null},${row.fullCostMax??null},${row.clientRateMin??row.clientRateMax??null},${row.clientRateMax??row.clientRateMin??null},${row.marginMin??null},${row.marginMax??null},${row.sourceType},${row.sourceStatus},'{}'::jsonb
          ) RETURNING id
        `;
        result.push({ ...row, id:inserted.id, organizationId:actor.organizationId, regionId });
      }
      return result;
    }));
    return NextResponse.json({rows:created},{status:201});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте строки импорта",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось импортировать ставки"},{status:500});
  }
}
