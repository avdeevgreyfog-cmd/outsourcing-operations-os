import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({requestId:z.string().uuid()});

type RequestScope={
  organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;client:string|null;
  title:string;vatMode:string|null;location:string|null;startDate:string|null;durationText:string|null;schedule:Record<string,unknown>;
  housingRule:string|null;travelRule:string|null;shuttleRule:string|null;ppeRule:string|null;medicalRule:string|null;toolsRule:string|null;
  status:string;archivedAt:string|null;
};
type ScenarioSnapshot={
  scenarioId:string;requestRoleId:string;specialtyId:string;role:string;count:number;rateNet:number;rateGross:number;billingUnit:string;
  monthlyRevenueNet:number;vatPct:number;workers:number;hoursPerWorker:number;
};

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
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<RequestScope>>`
        SELECT r.organization_id "organizationId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
          r.region_id "regionId",r.client_company_id "clientId",c.name client,r.title,r.vat_mode "vatMode",r.location_text location,
          r.expected_start_date::text "startDate",r.duration_text "durationText",r.schedule_json schedule,
          r.housing_rule "housingRule",r.travel_rule "travelRule",r.shuttle_rule "shuttleRule",r.ppe_rule "ppeRule",r.medical_rule "medicalRule",r.tools_rule "toolsRule",
          r.status,r.archived_at::text "archivedAt"
        FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id WHERE r.id=${body.requestId}::uuid
      `;
      if(!scope)throw new Error("Заявка не найдена");
      if(!canReadRow(actor.access,"sales.proposal.create",scope,actor))throw new AccessDeniedError("sales.proposal.create");
      if(scope.archivedAt)throw new Error("Сначала восстановите заявку из архива");
      if(["accepted","launched","lost"].includes(scope.status))throw new Error("Коммерческий цикл этой заявки уже закрыт");
      const scenarios=await tx<ScenarioSnapshot[]>`
        SELECT cs.id "scenarioId",rr.id "requestRoleId",rr.specialty_id "specialtyId",s.name role,rr.count_required count,
          COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0)::float8 "rateNet",
          COALESCE((cs.result_snapshot->>'clientRateGross')::numeric,(cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0)::float8 "rateGross",
          COALESCE(cs.result_snapshot->>'billingUnit','hour') "billingUnit",
          COALESCE((cs.result_snapshot->>'monthlyRevenueNet')::numeric,
            COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0)*COALESCE((cs.inputs_snapshot->>'workers')::numeric,rr.count_required)*COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0),0)::float8 "monthlyRevenueNet",
          COALESCE((cs.result_snapshot->>'vatPct')::numeric,0)::float8 "vatPct",
          COALESCE((cs.inputs_snapshot->>'workers')::int,rr.count_required) workers,
          COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0)::float8 "hoursPerWorker"
        FROM request_roles rr JOIN specialties s ON s.id=rr.specialty_id
        LEFT JOIN LATERAL (
          SELECT cs.* FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
          WHERE c.request_id=rr.request_id AND cs.request_role_id=rr.id AND cs.status='accepted'
          ORDER BY cs.accepted_at DESC NULLS LAST,cs.created_at DESC LIMIT 1
        ) cs ON true
        WHERE rr.request_id=${body.requestId}::uuid ORDER BY rr.created_at
      `;
      if(!scenarios.length||scenarios.some((item)=>!item.scenarioId))throw new Error("Сначала согласуйте расчёт для каждой позиции заявки");
      const [previous]=await tx<Array<{id:string;version:number}>>`SELECT id,version FROM proposals WHERE request_id=${body.requestId}::uuid ORDER BY version DESC LIMIT 1`;
      const version=(previous?.version??0)+1;
      const totalValue=scenarios.reduce((sum,item)=>sum+Number(item.monthlyRevenueNet),0);
      const included:string[]=[];const clientProvides:string[]=[];
      for(const [label,value] of [["Проживание",scope.housingRule],["Проезд",scope.travelRule],["Развозка",scope.shuttleRule],["СИЗ и спецодежда",scope.ppeRule],["Медицинские требования",scope.medicalRule],["Инструмент",scope.toolsRule]] as Array<[string,string|null]>){
        const owner=conditionLabel(value);if(owner==="Исполнитель")included.push(label);else if(owner==="Заказчик")clientProvides.push(label);
      }
      const scheduleLabel=[scope.schedule?.pattern,scope.schedule?.paidHours?`${scope.schedule.paidHours} оплачиваемых часов`:null].filter(Boolean).join(", ");
      const content={
        requestId:body.requestId,
        title:scope.title,
        objectName:scope.title,
        company:scope.client,
        clientId:scope.clientId,
        description:"Предоставление персонала по согласованной заявке и коммерческим условиям.",
        vatMode:scope.vatMode,
        vatPct:scenarios[0]?.vatPct??0,
        location:scope.location,
        expectedStartDate:scope.startDate,
        validUntil:null,
        schedule:scheduleLabel||null,
        projectDuration:scope.durationText,
        included,
        clientProvides,
        terms:"Оплата производится по фактически подтверждённому объёму оказанных услуг в соответствии с выбранной единицей расчёта.",
        additionalConditions:null,
        comment:null,
        roles:scenarios.map((item)=>({role:item.role,specialtyId:item.specialtyId,count:item.count,rateNet:item.rateNet,rateGross:item.rateGross,unit:item.billingUnit,scenarioId:item.scenarioId})),
      };
      const scenarioIds=scenarios.map((item)=>item.scenarioId);
      const [created]=await tx<Array<{id:string;version:number;status:string}>>`
        INSERT INTO proposals(organization_id,request_id,version,status,scenario_ids,total_value,content_snapshot,supersedes_proposal_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.requestId}::uuid,${version},'draft',${scenarioIds}::uuid[],${totalValue},${sql.json(content)},${previous?.id??null}::uuid,${actor.userId}::uuid)
        RETURNING id,version,status
      `;
      await tx`UPDATE requests SET status='proposal_draft',updated_at=now() WHERE id=${body.requestId}::uuid`;
      return created;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректная заявка",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
