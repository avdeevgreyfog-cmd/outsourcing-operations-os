import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
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
  result:jsonObject.optional(),
}).refine((value)=>value.calculationId||value.requestId,{message:"Нужна заявка или расчёт"});

type RuleRow={id:string;rules:Record<string,unknown>};

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
      const [requestRow]=await tx<Array<{organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;status:string;archivedAt:string|null}>>`
        SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",status,archived_at::text "archivedAt"
        FROM requests WHERE id=${requestId}::uuid
      `;
      if(!requestRow||!canReadRow(actor.access,"calculation.scenario.create",requestRow,actor))throw new AccessDeniedError("calculation.scenario.create");
      if(requestRow.archivedAt)throw new Error("Сначала восстановите заявку из архива");
      if(["accepted","launched","lost"].includes(requestRow.status))throw new Error("Коммерческий цикл заявки закрыт; новый расчёт нельзя добавить в зафиксированный результат");
      const [role]=await tx<Array<{id:string;specialtyId:string}>>`SELECT id,specialty_id "specialtyId" FROM request_roles WHERE id=${b.requestRoleId}::uuid AND request_id=${requestId}::uuid`;
      if(!role)throw new Error("Позиция не относится к выбранной заявке");
      const [model]=await tx<Array<{id:string}>>`SELECT id FROM calculation_models WHERE id=${b.modelId}::uuid AND active`;
      if(!model)throw new Error("Модель расчёта недоступна");

      let rule:RuleRow|undefined;
      if(b.ruleVersionId){
        [rule]=await tx<RuleRow[]>`
          SELECT id,rules_json rules FROM calculation_rule_versions
          WHERE id=${b.ruleVersionId}::uuid AND calculation_model_id=${b.modelId}::uuid
            AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
        `;
        if(!rule)throw new Error("Версия правил не относится к выбранной модели или больше не действует");
      }else{
        [rule]=await tx<RuleRow[]>`
          SELECT id,rules_json rules FROM calculation_rule_versions WHERE calculation_model_id=${b.modelId}::uuid
            AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
          ORDER BY version DESC,effective_from DESC LIMIT 1
        `;
      }
      const ruleVersionId=rule?.id??null;

      const inputs={...b.inputs,ruleVersionId};
      const isCommercialScenario="workerPayAmount" in b.inputs||"billingUnit" in b.inputs||"pricingMode" in b.inputs;
      const serverResult=isCommercialScenario
        ? calculateCommercialScenario({...inputs,costs:b.costs,rules:rule?.rules??{}}) as Record<string,unknown>
        : b.result??{};
      if(isCommercialScenario&&Object.keys(serverResult).length===0)throw new Error("Не удалось рассчитать экономику сценария");

      const [reference]=await tx<Array<{id:string;amountMin:number|string;amountMax:number|string|null;unit:string;paySemantics:string;source:string;sourceDate:string;confidence:string}>>`
        SELECT id,amount_min "amountMin",amount_max "amountMax",unit,pay_semantics "paySemantics",source,source_date::text "sourceDate",confidence
        FROM rate_reference_entries
        WHERE specialty_id=${role.specialtyId}::uuid
          AND (${requestRow.regionId}::uuid IS NULL OR region_id=${requestRow.regionId}::uuid OR region_id IS NULL)
          AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date)
        ORDER BY (region_id=${requestRow.regionId}::uuid) DESC,source_date DESC,created_at DESC LIMIT 1
      `;
      const referenceSnapshot=reference?{
        id:reference.id,amountMin:Number(reference.amountMin),amountMax:reference.amountMax==null?null:Number(reference.amountMax),unit:reference.unit,
        paySemantics:reference.paySemantics,source:reference.source,sourceDate:reference.sourceDate,confidence:reference.confidence,
      }:null;

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
        INSERT INTO calculation_scenarios (organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,rate_reference_snapshot,created_by_user_id)
        VALUES (${actor.organizationId}::uuid,${calculationId}::uuid,${b.requestRoleId}::uuid,${b.modelId}::uuid,${ruleVersionId}::uuid,${b.name},'draft',${sql.json(inputs)},${sql.json(b.costs)},${sql.json(serverResult)},${referenceSnapshot?sql.json(referenceSnapshot):null},${actor.userId}::uuid)
        RETURNING id,name,status,created_at "createdAt"
      `;
      await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${requestId}::uuid`;
      return {...created,calculationId,requestId,ruleVersionId,result:serverResult};
    }));
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры расчёта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
