import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

type CalculationContext={
  id:string;organizationId:string;requestId:string|null;tenderId:string|null;status:string;version:number;economicsDate:string;
  allocationMode:"headcount"|"labor_hours";projectCosts:Array<Record<string,unknown>>;ownerUserId:string|null;createdByUserId:string;
  teamId:string|null;regionId:string|null;clientId:string|null;sourceStatus:string|null;
};
type ScenarioTemplate={
  id:string;requestRoleId:string|null;tenderRoleId:string|null;modelId:string;ruleVersionId:string|null;name:string;
  inputs:Record<string,unknown>;costs:Array<Record<string,unknown>>;result:Record<string,unknown>;rateReference:Record<string,unknown>|null;
};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"calculation.scenario.create");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [current]=await tx<CalculationContext[]>`
        SELECT c.id,c.organization_id "organizationId",c.request_id "requestId",c.tender_id "tenderId",c.status,c.version,
          c.economics_date::text "economicsDate",c.allocation_mode "allocationMode",c.project_costs_json "projectCosts",
          c.owner_user_id "ownerUserId",c.created_by_user_id "createdByUserId",COALESCE(r.assigned_team_id,t.assigned_team_id) "teamId",
          COALESCE(r.region_id,t.region_id) "regionId",COALESCE(r.client_company_id,t.client_company_id) "clientId",
          COALESCE(r.status,t.stage) "sourceStatus"
        FROM calculations c LEFT JOIN requests r ON r.id=c.request_id LEFT JOIN tenders t ON t.id=c.tender_id
        WHERE c.id=${id}::uuid
      `;
      if(!current)throw new Error("Расчёт не найден");
      if(!canReadRow(actor.access,"calculation.scenario.create",current,actor))throw new AccessDeniedError("calculation.scenario.create");
      if(current.requestId&&["accepted","launched","lost"].includes(current.sourceStatus??""))throw new Error("Коммерческий цикл заявки закрыт");
      if(current.tenderId&&current.sourceStatus==="completed")throw new Error("Тендер завершён");

      const [latest]=current.requestId
        ? await tx<Array<{version:number}>>`SELECT COALESCE(max(version),0)::int version FROM calculations WHERE request_id=${current.requestId}::uuid`
        : await tx<Array<{version:number}>>`SELECT COALESCE(max(version),0)::int version FROM calculations WHERE tender_id=${current.tenderId}::uuid`;
      const nextVersion=(latest?.version??0)+1;
      const [created]=await tx<Array<{id:string}>>`
        INSERT INTO calculations(organization_id,request_id,tender_id,status,owner_user_id,created_by_user_id,version,supersedes_calculation_id,economics_date,allocation_mode,project_costs_json)
        VALUES(${actor.organizationId}::uuid,${current.requestId}::uuid,${current.tenderId}::uuid,'draft',${actor.userId}::uuid,${actor.userId}::uuid,
          ${nextVersion},${current.id}::uuid,${current.economicsDate}::date,${current.allocationMode},${sql.json(current.projectCosts as never)})
        RETURNING id
      `;

      const templates=await tx<ScenarioTemplate[]>`
        SELECT DISTINCT ON (COALESCE(request_role_id,tender_role_id))
          id,request_role_id "requestRoleId",tender_role_id "tenderRoleId",model_id "modelId",rule_version_id "ruleVersionId",name,
          inputs_snapshot inputs,cost_snapshot costs,result_snapshot result,rate_reference_snapshot "rateReference"
        FROM calculation_scenarios
        WHERE calculation_id=${current.id}::uuid
        ORDER BY COALESCE(request_role_id,tender_role_id),(status='accepted') DESC,version DESC,created_at DESC
      `;
      for(const template of templates){
        const inputs={...template.inputs,calculationVersion:nextVersion};
        await tx`
          INSERT INTO calculation_scenarios(organization_id,calculation_id,request_role_id,tender_role_id,model_id,rule_version_id,name,status,version,supersedes_scenario_id,inputs_snapshot,cost_snapshot,result_snapshot,rate_reference_snapshot,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${created.id}::uuid,${template.requestRoleId}::uuid,${template.tenderRoleId}::uuid,${template.modelId}::uuid,${template.ruleVersionId}::uuid,
            ${template.name},'draft',1,${template.id}::uuid,${sql.json(inputs as never)},${sql.json(template.costs as never)},${sql.json(template.result as never)},${template.rateReference?sql.json(template.rateReference as never):null},${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'calculation',${created.id}::uuid,'version_created',${`Создана версия расчёта v${nextVersion}`},${sql.json({supersedesCalculationId:current.id,sourceId:current.requestId??current.tenderId})})
      `;
      return {id:created.id,version:nextVersion,clonedScenarios:templates.length};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
