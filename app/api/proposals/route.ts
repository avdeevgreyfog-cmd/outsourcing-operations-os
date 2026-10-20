import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { getDefaultProposalTemplate } from "@/lib/commercial/proposal-template";
import { assertRequestCommercialEditable, CommercialRequestConflict } from "@/lib/commercial/request-lock";

const schema=z.object({requestId:z.string().uuid()});

type RequestScope={
  organizationId:string;ownerUserId:string|null;ownerName:string|null;ownerEmail:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;client:string|null;
  title:string;vatMode:string|null;location:string|null;startDate:string|null;durationText:string|null;schedule:Record<string,unknown>;
  housingRule:string|null;travelRule:string|null;shuttleRule:string|null;ppeRule:string|null;medicalRule:string|null;toolsRule:string|null;
  status:string;archivedAt:string|null;
};
type ScenarioSnapshot={
  scenarioId:string;requestRoleId:string;specialtyId:string;role:string;count:number;rateNet:number;rateGross:number;billingUnit:string;billingUnitLabel:string|null;
  monthlyRevenueNet:number;vatPct:number;workers:number|null;hoursPerWorker:number;pricingSnapshot:Record<string,unknown>;
};
class ProposalConsistencyConflict extends Error {}

function conditionLabel(value:string|null){
  if(value==="client")return "Заказчик";
  if(value==="include"||value==="us")return "Исполнитель";
  if(value==="not_required")return "Не требуется";
  return value;
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.proposal.create");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const selectedTemplate=await getDefaultProposalTemplate(actor);
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      await assertRequestCommercialEditable(tx,actor,body.requestId);
      const [scope]=await tx<Array<RequestScope>>`
        SELECT r.organization_id "organizationId",r.owner_user_id "ownerUserId",owner.display_name "ownerName",owner.email "ownerEmail",
          r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",r.region_id "regionId",r.client_company_id "clientId",c.name client,r.title,
          r.vat_mode "vatMode",r.location_text location,r.expected_start_date::text "startDate",r.duration_text "durationText",r.schedule_json schedule,
          r.housing_rule "housingRule",r.travel_rule "travelRule",r.shuttle_rule "shuttleRule",r.ppe_rule "ppeRule",r.medical_rule "medicalRule",r.tools_rule "toolsRule",
          r.status,r.archived_at::text "archivedAt"
        FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id
        WHERE r.id=${body.requestId}::uuid AND r.organization_id=${actor.organizationId}::uuid
      `;
      if(!scope)throw new Error("Заявка не найдена");
      if(!canReadRow(actor.access,"sales.proposal.create",scope,actor))throw new AccessDeniedError("sales.proposal.create");
      if(scope.archivedAt)throw new ProposalConsistencyConflict("Сначала восстановите заявку из архива");
      if(["accepted","launched","lost"].includes(scope.status))throw new ProposalConsistencyConflict("Коммерческий цикл этой заявки уже закрыт");

      const [approvedCalculation]=await tx<Array<{id:string;version:number}>>`
        SELECT id,version FROM calculations
        WHERE request_id=${body.requestId}::uuid AND status='approved'
        ORDER BY version DESC,approved_at DESC NULLS LAST,created_at DESC LIMIT 1
      `;
      if(!approvedCalculation)throw new ProposalConsistencyConflict("Сначала согласуйте целиком одну версию расчёта для всех позиций заявки");

      const scenarios=await tx<ScenarioSnapshot[]>`
        SELECT cs.id "scenarioId",rr.id "requestRoleId",rr.specialty_id "specialtyId",s.name role,rr.count_required count,
          COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0)::float8 "rateNet",
          COALESCE((cs.result_snapshot->>'clientRateGross')::numeric,(cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0)::float8 "rateGross",
          COALESCE(cs.result_snapshot->>'billingUnit','hour') "billingUnit",cs.result_snapshot->>'billingUnitLabel' "billingUnitLabel",
          COALESCE((cs.result_snapshot->>'monthlyRevenueNet')::numeric,
            COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0)*(cs.inputs_snapshot->>'workers')::numeric*COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0),0)::float8 "monthlyRevenueNet",
          COALESCE((cs.result_snapshot->>'vatPct')::numeric,0)::float8 "vatPct",
          (cs.inputs_snapshot->>'workers')::numeric::float8 workers,
          COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0)::float8 "hoursPerWorker",
          jsonb_build_object('scenarioId',cs.id,'billingUnit',COALESCE(cs.result_snapshot->>'billingUnit','hour'),'variableBillingUnit',cs.result_snapshot->'variableBillingUnit',
            'clientRateNet',COALESCE(cs.result_snapshot->'clientRateNet',cs.result_snapshot->'clientRateHourly'),'clientRateGross',cs.result_snapshot->'clientRateGross',
            'vatPct',cs.result_snapshot->'vatPct','fixedMonthlyNet',cs.result_snapshot->'fixedMonthlyNet','minimumMonthlyNet',cs.result_snapshot->'minimumMonthlyNet',
            'monthlyRevenueNet',COALESCE(cs.result_snapshot->'monthlyRevenueNet',to_jsonb(COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0)*(cs.inputs_snapshot->>'workers')::numeric*COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0))),
            'projectMonths',cs.result_snapshot->'projectMonths') "pricingSnapshot"
        FROM request_roles rr JOIN specialties s ON s.id=rr.specialty_id
        LEFT JOIN LATERAL (
          SELECT cs.* FROM calculation_scenarios cs
          WHERE cs.calculation_id=${approvedCalculation.id}::uuid AND cs.request_role_id=rr.id AND cs.status='accepted'
          ORDER BY cs.accepted_at DESC NULLS LAST,cs.version DESC,cs.created_at DESC LIMIT 1
        ) cs ON true
        WHERE rr.request_id=${body.requestId}::uuid ORDER BY rr.created_at
      `;
      if(!scenarios.length||scenarios.some((item)=>!item.scenarioId))throw new ProposalConsistencyConflict(`Расчёт v${approvedCalculation.version} согласован не для всех позиций заявки. Создайте и согласуйте актуальную версию расчёта`);
      if(scenarios.some(item=>item.workers===null||!Number.isSafeInteger(Number(item.workers))||Number(item.workers)<=0))
        throw new ProposalConsistencyConflict("В согласованном расчёте не зафиксирована численность. Создайте и согласуйте новую версию расчёта; текущие позиции не подставлены в старую экономику");
      if(scenarios.some(item=>Number(item.count)!==Number(item.workers)))
        throw new ProposalConsistencyConflict("Численность заявки изменилась после расчёта. Создайте и согласуйте новую версию расчёта; сумма прежней версии не пересчитана автоматически");
      const [previous]=await tx<Array<{id:string;version:number}>>`SELECT id,version FROM proposals WHERE request_id=${body.requestId}::uuid ORDER BY version DESC LIMIT 1`;
      const version=(previous?.version??0)+1;
      const totalValue=scenarios.reduce((sum,item)=>sum+Number(item.monthlyRevenueNet),0);
      const included:string[]=[];const clientProvides:string[]=[];
      for(const [label,value] of [["Проживание",scope.housingRule],["Проезд",scope.travelRule],["Развозка",scope.shuttleRule],["СИЗ и спецодежда",scope.ppeRule],["Медицинские требования",scope.medicalRule],["Инструмент",scope.toolsRule]] as Array<[string,string|null]>){
        const owner=conditionLabel(value);if(owner==="Исполнитель")included.push(label);else if(owner==="Заказчик")clientProvides.push(label);
      }
      const scheduleLabel=[scope.schedule?.pattern,scope.schedule?.paidHours?`${scope.schedule.paidHours} оплачиваемых часов`:null].filter(Boolean).join(", ");
      const content={
        requestId:body.requestId,calculationId:approvedCalculation.id,calculationVersion:approvedCalculation.version,title:scope.title,objectName:scope.title,company:scope.client,clientId:scope.clientId,
        description:selectedTemplate.config.intro,vatMode:scope.vatMode,vatPct:scenarios[0]?.vatPct??0,location:scope.location,expectedStartDate:scope.startDate,
        validUntil:null,schedule:scheduleLabel||null,projectDuration:scope.durationText,included,clientProvides,
        terms:"Условия проекта согласовываются индивидуально и фиксируются в договоре и приложении.",additionalConditions:null,comment:null,
        template:{id:selectedTemplate.id,name:selectedTemplate.name,kind:selectedTemplate.kind,version:selectedTemplate.version},
        presentation:selectedTemplate.config,
        manager:{name:scope.ownerName||actor.displayName,email:scope.ownerEmail||actor.email,phone:null,telegram:null},
        roles:scenarios.map((item)=>({role:item.role,specialtyId:item.specialtyId,requestRoleId:item.requestRoleId,count:Number(item.workers),workers:Number(item.workers),hoursPerWorker:item.hoursPerWorker,monthlyRevenueNet:item.monthlyRevenueNet,
          rateNet:item.rateNet,rateGross:item.rateGross,unit:item.billingUnit,unitLabel:item.billingUnitLabel,scenarioId:item.scenarioId,pricingSnapshot:item.pricingSnapshot,
          source:{calculationId:approvedCalculation.id,calculationVersion:approvedCalculation.version,requestRoleId:item.requestRoleId,scenarioId:item.scenarioId}})),
      };
      const scenarioIds=scenarios.map((item)=>item.scenarioId);
      const [created]=await tx<Array<{id:string;version:number;status:string}>>`
        INSERT INTO proposals(organization_id,request_id,version,status,scenario_ids,total_value,content_snapshot,supersedes_proposal_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.requestId}::uuid,${version},'draft',${scenarioIds}::uuid[],${totalValue},${tx.json(JSON.parse(JSON.stringify(content)))},${previous?.id??null}::uuid,${actor.userId}::uuid)
        RETURNING id,version,status
      `;
      await tx`UPDATE requests SET status='proposal_draft',updated_at=now() WHERE id=${body.requestId}::uuid`;
      return created;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректная заявка",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof CommercialRequestConflict||error instanceof ProposalConsistencyConflict)return NextResponse.json({error:error.message},{status:409});
    console.error(error);return NextResponse.json({error:"Не удалось создать КП. Проверьте согласованную версию расчёта и повторите попытку"},{status:500});
  }
}
