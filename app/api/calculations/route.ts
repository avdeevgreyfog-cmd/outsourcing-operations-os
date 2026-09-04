import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const jsonObject=z.record(z.string(),z.json());
const schema=z.object({
  calculationId:z.string().uuid().optional(),
  requestId:z.string().uuid().optional(),
  requestRoleId:z.string().uuid(),
  modelId:z.string().uuid(),
  ruleVersionId:z.string().uuid().optional(),
  name:z.string().trim().min(2).max(160),
  inputs:jsonObject,
  costs:z.array(jsonObject),
  result:jsonObject,
}).refine((value)=>value.calculationId||value.requestId,{message:"Нужна заявка или расчёт"});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"calculation.scenario.create");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const b=schema.parse(await request.json());
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let calculationId=b.calculationId??null;
      let requestId=b.requestId??null;
      if(calculationId){
        const [calc]=await tx<Array<{id:string;requestId:string}>>`SELECT id,request_id "requestId" FROM calculations WHERE id=${calculationId}::uuid`;
        if(!calc)throw new Error("Расчёт не найден");
        requestId=calc.requestId;
      }
      if(!requestId)throw new Error("Не удалось определить заявку");
      const [requestRow]=await tx<Array<{organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null}>>`
        SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId"
        FROM requests WHERE id=${requestId}::uuid
      `;
      if(!requestRow||!canReadRow(actor.access,"calculation.scenario.create",requestRow,actor))throw new AccessDeniedError("calculation.scenario.create");
      const [role]=await tx<Array<{id:string}>>`SELECT id FROM request_roles WHERE id=${b.requestRoleId}::uuid AND request_id=${requestId}::uuid`;
      if(!role)throw new Error("Позиция не относится к выбранной заявке");
      const [model]=await tx<Array<{id:string}>>`SELECT id FROM calculation_models WHERE id=${b.modelId}::uuid AND active`;
      if(!model)throw new Error("Модель расчёта недоступна");
      if(!calculationId){
        const [existing]=await tx<Array<{id:string}>>`SELECT id FROM calculations WHERE request_id=${requestId}::uuid ORDER BY created_at DESC LIMIT 1`;
        if(existing)calculationId=existing.id;
        else{
          const [createdCalc]=await tx<Array<{id:string}>>`
            INSERT INTO calculations(organization_id,request_id,status,owner_user_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${requestId}::uuid,'draft',${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id
          `;
          calculationId=createdCalc.id;
        }
      }
      const [created]=await tx<Array<{id:string;name:string;status:string;createdAt:string}>>`
        INSERT INTO calculation_scenarios (organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,created_by_user_id)
        VALUES (${actor.organizationId}::uuid,${calculationId}::uuid,${b.requestRoleId}::uuid,${b.modelId}::uuid,${b.ruleVersionId??null}::uuid,${b.name},'draft',${sql.json(b.inputs)},${sql.json(b.costs)},${sql.json(b.result)},${actor.userId}::uuid)
        RETURNING id,name,status,created_at "createdAt"
      `;
      await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${requestId}::uuid AND status NOT IN ('archived','accepted','launched')`;
      return {...created,calculationId,requestId};
    }));
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры расчёта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
