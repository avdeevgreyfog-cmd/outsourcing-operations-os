import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
import { withTenant } from "@/lib/db/client";

const jsonObject=z.record(z.string(),z.json());
type JsonRecord=z.infer<typeof jsonObject>;
const schema=z.object({
  calculationId:z.string().uuid().optional(),
  sourceType:z.enum(["request","tender"]).optional(),
  sourceId:z.string().uuid().optional(),
  sourceRoleId:z.string().uuid().optional(),
  requestId:z.string().uuid().optional(),
  requestRoleId:z.string().uuid().optional(),
  modelId:z.string().uuid(),
  ruleVersionId:z.string().uuid().optional(),
  name:z.string().trim().min(2).max(160),
  inputs:jsonObject,
  costs:z.array(jsonObject),
  result:jsonObject.optional(),
}).superRefine((value,ctx)=>{
  if(!value.calculationId&&!value.sourceId&&!value.requestId)ctx.addIssue({code:"custom",message:"Нужен источник расчёта"});
  if(!value.sourceRoleId&&!value.requestRoleId)ctx.addIssue({code:"custom",message:"Нужна позиция для расчёта"});
});

type RuleRow={id:string;rules:JsonRecord};
type SourceScope={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;status?:string;stage?:string;archivedAt?:string|null};

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"calculation.scenario.create");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const b=schema.parse(await request.json());
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let calculationId=b.calculationId??null;
      let sourceType:b["sourceType"]=(b.sourceType??(b.requestId?"request":undefined));
      let sourceId=b.sourceId??b.requestId??null;
      let requestId:string|null=null;let tenderId:string|null=null;
      if(calculationId){
        const [calc]=await tx<Array<{id:string;requestId:string|null;tenderId:string|null}>>`SELECT id,request_id "requestId",tender_id "tenderId" FROM calculations WHERE id=${calculationId}::uuid`;
        if(!calc)throw new Error("Расчёт не найден");
        sourceType=calc.tenderId?"tender":"request";sourceId=calc.tenderId??calc.requestId;
      }
      if(!sourceType||!sourceId)throw new Error("Не удалось определить источник расчёта");
      requestId=sourceType==="request"?sourceId:null;tenderId=sourceType==="tender"?sourceId:null;

      let sourceRow:SourceScope|undefined;
      if(sourceType==="request"){
        [sourceRow]=await tx<SourceScope[]>`
          SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",status,archived_at::text "archivedAt"
          FROM requests WHERE id=${sourceId}::uuid
        `;
        if(!sourceRow||!canReadRow(actor.access,"calculation.scenario.create",sourceRow,actor))throw new AccessDeniedError("calculation.scenario.create");
        if(sourceRow.archivedAt)throw new Error("Сначала восстановите заявку из архива");
        if(["accepted","launched","lost"].includes(sourceRow.status??""))throw new Error("Коммерческий цикл заявки закрыт; новый расчёт нельзя добавить в зафиксированный результат");
      }else{
        [sourceRow]=await tx<SourceScope[]>`
          SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",stage
          FROM tenders WHERE id=${sourceId}::uuid AND archived_at IS NULL
        `;
        if(!sourceRow||!canReadRow(actor.access,"calculation.scenario.create",sourceRow,actor))throw new AccessDeniedError("calculation.scenario.create");
        if(sourceRow.stage==="completed")throw new Error("Тендер завершён; новый расчёт нельзя добавить в закрытый процесс");
      }

      const sourceRoleId=b.sourceRoleId??b.requestRoleId;
      let specialtyId:string|null=null;
      if(sourceType==="request"){
        const [role]=await tx<Array<{id:string;specialtyId:string}>>`SELECT id,specialty_id "specialtyId" FROM request_roles WHERE id=${sourceRoleId}::uuid AND request_id=${sourceId}::uuid`;
        if(!role)throw new Error("Позиция не относится к выбранной заявке");specialtyId=role.specialtyId;
      }else{
        const [role]=await tx<Array<{id:string;specialtyId:string|null}>>`SELECT id,specialty_id "specialtyId" FROM tender_roles WHERE id=${sourceRoleId}::uuid AND tender_id=${sourceId}::uuid`;
        if(!role)throw new Error("Позиция не относится к выбранному тендеру");specialtyId=role.specialtyId;
      }
      const [model]=await tx<Array<{id:string}>>`SELECT id FROM calculation_models WHERE id=${b.modelId}::uuid AND active`;
      if(!model)throw new Error("Модель расчёта недоступна");

      let rule:RuleRow|undefined;
      if(b.ruleVersionId){
        [rule]=await tx<RuleRow[]>`SELECT id,rules_json rules FROM calculation_rule_versions WHERE id=${b.ruleVersionId}::uuid AND calculation_model_id=${b.modelId}::uuid AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)`;
        if(!rule)throw new Error("Версия правил не относится к выбранной модели или больше не действует");
      }else{
        [rule]=await tx<RuleRow[]>`SELECT id,rules_json rules FROM calculation_rule_versions WHERE calculation_model_id=${b.modelId}::uuid AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date) ORDER BY version DESC,effective_from DESC LIMIT 1`;
      }
      const ruleVersionId=rule?.id??null;
      const inputs:JsonRecord={...b.inputs,ruleVersionId,sourceType,sourceId};
      const isCommercialScenario="workerPayAmount" in b.inputs||"billingUnit" in b.inputs||"pricingMode" in b.inputs;
      const serverResult:JsonRecord=isCommercialScenario?calculateCommercialScenario({...inputs,costs:b.costs,rules:rule?.rules??{}}) as JsonRecord:b.result??{};
      if(isCommercialScenario&&Object.keys(serverResult).length===0)throw new Error("Не удалось рассчитать экономику сценария");

      let referenceSnapshot:Record<string,unknown>|null=null;
      if(specialtyId){
        const [reference]=await tx<Array<{id:string;amountMin:number|string;amountMax:number|string|null;unit:string;paySemantics:string;source:string;sourceDate:string;confidence:string}>>`
          SELECT id,amount_min "amountMin",amount_max "amountMax",unit,pay_semantics "paySemantics",source,source_date::text "sourceDate",confidence
          FROM rate_reference_entries WHERE specialty_id=${specialtyId}::uuid AND (${sourceRow.regionId}::uuid IS NULL OR region_id=${sourceRow.regionId}::uuid OR region_id IS NULL) AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date)
          ORDER BY (region_id=${sourceRow.regionId}::uuid) DESC,source_date DESC,created_at DESC LIMIT 1
        `;
        referenceSnapshot=reference?{id:reference.id,amountMin:Number(reference.amountMin),amountMax:reference.amountMax==null?null:Number(reference.amountMax),unit:reference.unit,paySemantics:reference.paySemantics,source:reference.source,sourceDate:reference.sourceDate,confidence:reference.confidence}:null;
      }

      if(!calculationId){
        const existing=sourceType==="request"
          ? await tx<Array<{id:string}>>`SELECT id FROM calculations WHERE request_id=${sourceId}::uuid ORDER BY created_at DESC LIMIT 1`
          : await tx<Array<{id:string}>>`SELECT id FROM calculations WHERE tender_id=${sourceId}::uuid ORDER BY created_at DESC LIMIT 1`;
        if(existing[0])calculationId=existing[0].id;
        else{
          const [createdCalc]=await tx<Array<{id:string}>>`
            INSERT INTO calculations(organization_id,request_id,tender_id,status,owner_user_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${requestId}::uuid,${tenderId}::uuid,'draft',${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id
          `;calculationId=createdCalc.id;
        }
      }
      const [created]=await tx<Array<{id:string;name:string;status:string;createdAt:string}>>`
        INSERT INTO calculation_scenarios(organization_id,calculation_id,request_role_id,tender_role_id,model_id,rule_version_id,name,status,inputs_snapshot,cost_snapshot,result_snapshot,rate_reference_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${calculationId}::uuid,${sourceType==="request"?sourceRoleId:null}::uuid,${sourceType==="tender"?sourceRoleId:null}::uuid,${b.modelId}::uuid,${ruleVersionId}::uuid,${b.name},'draft',${sql.json(inputs)},${sql.json(b.costs)},${sql.json(serverResult)},${referenceSnapshot?sql.json(referenceSnapshot):null},${actor.userId}::uuid)
        RETURNING id,name,status,created_at "createdAt"
      `;
      if(sourceType==="request")await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${sourceId}::uuid`;
      else await tx`UPDATE tenders SET stage='calculation',updated_at=now() WHERE id=${sourceId}::uuid AND stage IN ('new','analysis','clarification','calculation','approval')`;
      return {...created,calculationId,sourceType,sourceId,requestId,tenderId,ruleVersionId,result:serverResult};
    }));
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры расчёта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
