import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
import { withTenant } from "@/lib/db/client";

const jsonObject=z.record(z.string(),z.json());
type JsonRecord=z.infer<typeof jsonObject>;
type SourceType="request"|"tender";
const schema=z.object({
  calculationId:z.string().uuid().optional(),
  sourceType:z.enum(["request","tender"]).optional(),
  sourceId:z.string().uuid().optional(),
  sourceRoleId:z.string().uuid().optional(),
  requestId:z.string().uuid().optional(),
  requestRoleId:z.string().uuid().optional(),
  modelId:z.string().uuid(),
  ruleVersionId:z.string().uuid().optional(),
  supersedesScenarioId:z.string().uuid().optional(),
  allocationMode:z.enum(["headcount","labor_hours"]).optional(),
  name:z.string().trim().min(2).max(160),
  inputs:jsonObject,
  costs:z.array(jsonObject),
  result:jsonObject.optional(),
}).superRefine((value,ctx)=>{
  if(!value.calculationId&&!value.sourceId&&!value.requestId)ctx.addIssue({code:"custom",message:"Нужен источник расчёта"});
  if(!value.sourceRoleId&&!value.requestRoleId)ctx.addIssue({code:"custom",message:"Нужна позиция для расчёта"});
});

type RuleRow={id:string;rules:JsonRecord};
type SourceScope={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;status?:string;stage?:string;archivedAt?:string|null;expectedStartDate?:string|null};
type ExistingCalculation={id:string;requestId:string|null;tenderId:string|null;status:string;version:number;economicsDate:string;allocationMode:"headcount"|"labor_hours"};

function dateFromJson(value:unknown){return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function numberFromJson(value:unknown,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"calculation.scenario.create");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const b=schema.parse(await request.json());
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let calculationId:string|null=b.calculationId??null;
      let calculationVersion=1;
      let existingCalculation:ExistingCalculation|undefined;
      let sourceType:SourceType|undefined=b.sourceType??(b.requestId?"request":undefined);
      let sourceId:string|null=b.sourceId??b.requestId??null;
      if(calculationId){
        const [calc]=await tx<ExistingCalculation[]>`
          SELECT id,request_id "requestId",tender_id "tenderId",status,version,economics_date::text "economicsDate",allocation_mode "allocationMode"
          FROM calculations WHERE id=${calculationId}::uuid
        `;
        if(!calc)throw new Error("Расчёт не найден");
        if(["approved","superseded"].includes(calc.status))throw new Error("Принятый расчёт зафиксирован. Создайте новую версию расчёта для изменений");
        existingCalculation=calc;calculationVersion=calc.version;
        sourceType=calc.tenderId?"tender":"request";sourceId=calc.tenderId??calc.requestId;
      }
      if(!sourceType||!sourceId)throw new Error("Не удалось определить источник расчёта");
      const resolvedSourceType:SourceType=sourceType;
      const resolvedSourceId:string=sourceId;
      const requestId:string|null=resolvedSourceType==="request"?resolvedSourceId:null;
      const tenderId:string|null=resolvedSourceType==="tender"?resolvedSourceId:null;

      let sourceRow:SourceScope|undefined;
      if(resolvedSourceType==="request"){
        [sourceRow]=await tx<SourceScope[]>`
          SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",status,
            archived_at::text "archivedAt",expected_start_date::text "expectedStartDate"
          FROM requests WHERE id=${resolvedSourceId}::uuid
        `;
        if(!sourceRow||!canReadRow(actor.access,"calculation.scenario.create",sourceRow,actor))throw new AccessDeniedError("calculation.scenario.create");
        if(sourceRow.archivedAt)throw new Error("Сначала восстановите заявку из архива");
        if(["accepted","launched","lost"].includes(sourceRow.status??""))throw new Error("Коммерческий цикл заявки закрыт; новый расчёт нельзя добавить в зафиксированный результат");
      }else{
        [sourceRow]=await tx<SourceScope[]>`
          SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",stage,
            NULL::text "expectedStartDate"
          FROM tenders WHERE id=${resolvedSourceId}::uuid AND archived_at IS NULL
        `;
        if(!sourceRow||!canReadRow(actor.access,"calculation.scenario.create",sourceRow,actor))throw new AccessDeniedError("calculation.scenario.create");
        if(sourceRow.stage==="completed")throw new Error("Тендер завершён; новый расчёт нельзя добавить в закрытый процесс");
      }

      const sourceRoleId=b.sourceRoleId??b.requestRoleId;
      if(!sourceRoleId)throw new Error("Не удалось определить позицию расчёта");
      const resolvedRoleId:string=sourceRoleId;
      let specialtyId:string|null=null;
      if(resolvedSourceType==="request"){
        const [role]=await tx<Array<{id:string;specialtyId:string}>>`SELECT id,specialty_id "specialtyId" FROM request_roles WHERE id=${resolvedRoleId}::uuid AND request_id=${resolvedSourceId}::uuid`;
        if(!role)throw new Error("Позиция не относится к выбранной заявке");specialtyId=role.specialtyId;
      }else{
        const [role]=await tx<Array<{id:string;specialtyId:string|null}>>`SELECT id,specialty_id "specialtyId" FROM tender_roles WHERE id=${resolvedRoleId}::uuid AND tender_id=${resolvedSourceId}::uuid`;
        if(!role)throw new Error("Позиция не относится к выбранному тендеру");specialtyId=role.specialtyId;
      }
      const [model]=await tx<Array<{id:string}>>`SELECT id FROM calculation_models WHERE id=${b.modelId}::uuid AND active`;
      if(!model)throw new Error("Модель расчёта недоступна");

      const economicsDate=dateFromJson(b.inputs.economicsDate)??existingCalculation?.economicsDate??sourceRow.expectedStartDate??new Date().toISOString().slice(0,10);
      const allocationMode=b.allocationMode??(b.inputs.projectAllocationMode==="labor_hours"?"labor_hours":"headcount");

      let rule:RuleRow|undefined;
      if(b.ruleVersionId){
        [rule]=await tx<RuleRow[]>`
          SELECT id,rules_json rules FROM calculation_rule_versions
          WHERE id=${b.ruleVersionId}::uuid AND calculation_model_id=${b.modelId}::uuid
            AND effective_from<=${economicsDate}::date AND (effective_to IS NULL OR effective_to>=${economicsDate}::date)
        `;
        if(!rule)throw new Error("Версия правил не относится к выбранной модели или не действует на дату экономики");
      }else{
        [rule]=await tx<RuleRow[]>`
          SELECT id,rules_json rules FROM calculation_rule_versions
          WHERE calculation_model_id=${b.modelId}::uuid
            AND effective_from<=${economicsDate}::date AND (effective_to IS NULL OR effective_to>=${economicsDate}::date)
          ORDER BY version DESC,effective_from DESC LIMIT 1
        `;
      }
      const ruleVersionId=rule?.id??null;

      if(!calculationId){
        const existing=resolvedSourceType==="request"
          ? await tx<ExistingCalculation[]>`
              SELECT id,request_id "requestId",tender_id "tenderId",status,version,economics_date::text "economicsDate",allocation_mode "allocationMode"
              FROM calculations WHERE request_id=${resolvedSourceId}::uuid ORDER BY version DESC,created_at DESC LIMIT 1
            `
          : await tx<ExistingCalculation[]>`
              SELECT id,request_id "requestId",tender_id "tenderId",status,version,economics_date::text "economicsDate",allocation_mode "allocationMode"
              FROM calculations WHERE tender_id=${resolvedSourceId}::uuid ORDER BY version DESC,created_at DESC LIMIT 1
            `;
        const latest=existing[0];
        if(latest&&!['approved','superseded'].includes(latest.status)){
          calculationId=latest.id;calculationVersion=latest.version;existingCalculation=latest;
        }else{
          calculationVersion=(latest?.version??0)+1;
          const [createdCalc]=await tx<Array<{id:string}>>`
            INSERT INTO calculations(organization_id,request_id,tender_id,status,owner_user_id,created_by_user_id,version,supersedes_calculation_id,economics_date,allocation_mode,project_costs_json)
            VALUES(${actor.organizationId}::uuid,${requestId}::uuid,${tenderId}::uuid,'draft',${actor.userId}::uuid,${actor.userId}::uuid,${calculationVersion},${latest?.id??null}::uuid,${economicsDate}::date,${allocationMode},'[]'::jsonb)
            RETURNING id
          `;calculationId=createdCalc.id;
        }
      }
      if(!calculationId)throw new Error("Не удалось создать расчёт");

      const inputs:JsonRecord={...b.inputs,ruleVersionId,sourceType:resolvedSourceType,sourceId:resolvedSourceId,economicsDate,calculationVersion,projectAllocationMode:allocationMode};
      const isCommercialScenario="workerPayAmount" in b.inputs||"billingUnit" in b.inputs||"pricingMode" in b.inputs;
      const serverResult:JsonRecord=isCommercialScenario?calculateCommercialScenario({...inputs,costs:b.costs,rules:rule?.rules??{}}) as JsonRecord:b.result??{};
      if(isCommercialScenario&&Object.keys(serverResult).length===0)throw new Error("Не удалось рассчитать экономику сценария");

      let referenceSnapshot:JsonRecord|null=null;
      if(specialtyId){
        const [reference]=await tx<Array<{id:string;amountMin:number|string;amountMax:number|string|null;unit:string;paySemantics:string;employmentModel:string;source:string;sourceDate:string;confidence:string}>>`
          SELECT id,amount_min "amountMin",amount_max "amountMax",unit,pay_semantics "paySemantics",employment_model "employmentModel",source,source_date::text "sourceDate",confidence
          FROM rate_reference_entries
          WHERE specialty_id=${specialtyId}::uuid
            AND (${sourceRow.regionId}::uuid IS NULL OR region_id=${sourceRow.regionId}::uuid OR region_id IS NULL)
            AND valid_from<=${economicsDate}::date AND (valid_to IS NULL OR valid_to>=${economicsDate}::date)
          ORDER BY (region_id=${sourceRow.regionId}::uuid) DESC,source_date DESC,created_at DESC LIMIT 1
        `;
        referenceSnapshot=reference?{
          id:reference.id,amountMin:Number(reference.amountMin),amountMax:reference.amountMax==null?null:Number(reference.amountMax),unit:reference.unit,
          paySemantics:reference.paySemantics,employmentModel:reference.employmentModel,source:reference.source,sourceDate:reference.sourceDate,confidence:reference.confidence,
        }:null;
      }

      const rawProjectCosts=b.costs.filter(cost=>cost.scope==="project").map(cost=>{
        const entered=numberFromJson(cost.enteredAmount,numberFromJson(cost.amount,0));
        return {...cost,amount:entered,enteredAmount:entered,allocationShare:1};
      });
      await tx`
        UPDATE calculations SET economics_date=${economicsDate}::date,allocation_mode=${allocationMode},project_costs_json=${sql.json(rawProjectCosts)},updated_at=now()
        WHERE id=${calculationId}::uuid
      `;

      const requestRoleId=resolvedSourceType==="request"?resolvedRoleId:null;
      const tenderRoleId=resolvedSourceType==="tender"?resolvedRoleId:null;
      let supersedesScenarioId=b.supersedesScenarioId??null;
      if(supersedesScenarioId){
        const [previous]=await tx<Array<{id:string}>>`
          SELECT id FROM calculation_scenarios WHERE id=${supersedesScenarioId}::uuid AND calculation_id=${calculationId}::uuid
            AND COALESCE(request_role_id,tender_role_id)=${resolvedRoleId}::uuid
        `;
        if(!previous)throw new Error("Исходный сценарий не относится к выбранной позиции расчёта");
      }else{
        const [previous]=await tx<Array<{id:string}>>`
          SELECT id FROM calculation_scenarios WHERE calculation_id=${calculationId}::uuid
            AND COALESCE(request_role_id,tender_role_id)=${resolvedRoleId}::uuid
          ORDER BY version DESC,created_at DESC LIMIT 1
        `;
        supersedesScenarioId=previous?.id??null;
      }
      const [versionRow]=await tx<Array<{version:number}>>`
        SELECT COALESCE(max(version),0)::int+1 version FROM calculation_scenarios
        WHERE calculation_id=${calculationId}::uuid AND COALESCE(request_role_id,tender_role_id)=${resolvedRoleId}::uuid
      `;
      const scenarioVersion=versionRow?.version??1;
      const [created]=await tx<Array<{id:string;name:string;status:string;createdAt:string}>>`
        INSERT INTO calculation_scenarios(organization_id,calculation_id,request_role_id,tender_role_id,model_id,rule_version_id,name,status,version,supersedes_scenario_id,inputs_snapshot,cost_snapshot,result_snapshot,rate_reference_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${calculationId}::uuid,${requestRoleId}::uuid,${tenderRoleId}::uuid,${b.modelId}::uuid,${ruleVersionId}::uuid,${b.name},'draft',${scenarioVersion},${supersedesScenarioId}::uuid,${sql.json(inputs)},${sql.json(b.costs)},${sql.json(serverResult)},${referenceSnapshot?sql.json(referenceSnapshot):null},${actor.userId}::uuid)
        RETURNING id,name,status,created_at "createdAt"
      `;
      if(resolvedSourceType==="request")await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${resolvedSourceId}::uuid`;
      else await tx`UPDATE tenders SET stage='calculation',updated_at=now() WHERE id=${resolvedSourceId}::uuid AND stage IN ('new','analysis','clarification','calculation','approval')`;
      return {...created,calculationId,calculationVersion,scenarioVersion,sourceType:resolvedSourceType,sourceId:resolvedSourceId,requestId,tenderId,ruleVersionId,economicsDate,result:serverResult};
    }));
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры расчёта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
