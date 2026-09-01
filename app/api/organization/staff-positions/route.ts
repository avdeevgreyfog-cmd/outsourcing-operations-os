import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const fields=z.object({
  code:z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9-]+$/),name:z.string().trim().min(2).max(180),
  jobProfileId:z.string().uuid(),organizationUnitId:z.string().uuid(),legalEntityId:z.string().uuid().nullable().optional(),regionId:z.string().uuid().nullable().optional(),reportsToPositionId:z.string().uuid().nullable().optional(),
  capacity:z.number().positive().max(999),level:z.number().int().min(0).max(30).default(0),status:z.enum(["planned","open","filled","frozen","closed"]),effectiveFrom:z.string().date(),effectiveTo:z.string().date().nullable().optional(),
});
const base=fields.refine(value=>!value.effectiveTo||value.effectiveTo>=value.effectiveFrom,{message:"Дата окончания раньше даты начала",path:["effectiveTo"]});
const update=fields.partial().extend({id:z.string().uuid()}).refine(value=>!value.effectiveTo||!value.effectiveFrom||value.effectiveTo>=value.effectiveFrom,{message:"Дата окончания раньше даты начала",path:["effectiveTo"]});

async function actor(){const value=await getCurrentActor();if(!value)throw new Error("UNAUTHORIZED");requireCapability(value,"organization.position.manage");if(value.demo)throw new Error("DEMO");return value}

export async function POST(request:Request){try{const current=await actor();const body=base.parse(await request.json());const [row]=await withTenant(current.organizationId,current.userId,sql=>sql.unsafe<Array<{id:string}>>(
  "INSERT INTO staff_positions(organization_id,code,name,job_profile_id,organization_unit_id,legal_entity_id,region_id,reports_to_position_id,capacity,level,status,effective_from,effective_to,created_by_user_id) VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9,$10,$11,$12::date,$13::date,$14::uuid) RETURNING id",
  [current.organizationId,body.code,body.name,body.jobProfileId,body.organizationUnitId,body.legalEntityId??null,body.regionId??null,body.reportsToPositionId??null,body.capacity,body.level,body.status,body.effectiveFrom,body.effectiveTo??null,current.userId]));return NextResponse.json({ok:true,id:row.id},{status:201})}catch(error){return fail(error,"Не удалось создать штатную позицию")}}

export async function PATCH(request:Request){try{const current=await actor();const body=update.parse(await request.json());const rows=await withTenant(current.organizationId,current.userId,sql=>sql.unsafe<Array<{id:string}>>(
  "UPDATE staff_positions SET code=COALESCE($2,code),name=COALESCE($3,name),job_profile_id=COALESCE($4::uuid,job_profile_id),organization_unit_id=COALESCE($5::uuid,organization_unit_id),legal_entity_id=COALESCE($6::uuid,legal_entity_id),region_id=COALESCE($7::uuid,region_id),reports_to_position_id=COALESCE($8::uuid,reports_to_position_id),capacity=COALESCE($9,capacity),level=COALESCE($10,level),status=COALESCE($11,status),effective_from=COALESCE($12::date,effective_from),effective_to=COALESCE($13::date,effective_to),updated_at=now() WHERE id=$1::uuid RETURNING id",
  [body.id,body.code??null,body.name??null,body.jobProfileId??null,body.organizationUnitId??null,body.legalEntityId??null,body.regionId??null,body.reportsToPositionId??null,body.capacity??null,body.level??null,body.status??null,body.effectiveFrom??null,body.effectiveTo??null]));if(!rows.length)throw new Error("NOT_FOUND");return NextResponse.json({ok:true})}catch(error){return fail(error,"Не удалось изменить штатную позицию")}}

function fail(error:unknown,message:string){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполнение полей",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Требуется вход в систему"},{status:401});if(error instanceof Error&&error.message==="DEMO")return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Штатная позиция не найдена"},{status:404});console.error(error);return NextResponse.json({error:message},{status:500})}
