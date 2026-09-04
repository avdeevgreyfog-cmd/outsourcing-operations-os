import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({requestId:z.string().uuid()});

type RequestScope={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;title:string;vatMode:string|null;location:string|null;startDate:string|null};
type ScenarioSnapshot={scenarioId:string;requestRoleId:string;specialtyId:string;role:string;count:number;rate:number;workers:number;hoursPerWorker:number};

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.proposal.create");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<RequestScope>>`
        SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",
          region_id "regionId",client_company_id "clientId",title,vat_mode "vatMode",location_text location,expected_start_date::text "startDate"
        FROM requests WHERE id=${body.requestId}::uuid
      `;
      if(!scope)throw new Error("Заявка не найдена");
      if(!canReadRow(actor.access,"sales.proposal.create",scope,actor))throw new AccessDeniedError("sales.proposal.create");
      const scenarios=await tx<ScenarioSnapshot[]>`
        SELECT cs.id "scenarioId",rr.id "requestRoleId",rr.specialty_id "specialtyId",s.name role,rr.count_required count,
          COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0)::float8 rate,
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
      const totalValue=scenarios.reduce((sum,item)=>sum+(Number(item.rate)*Number(item.workers)*Number(item.hoursPerWorker)),0);
      const content={
        requestId:body.requestId,
        title:scope.title,
        clientId:scope.clientId,
        vatMode:scope.vatMode,
        location:scope.location,
        expectedStartDate:scope.startDate,
        roles:scenarios.map((item)=>({role:item.role,specialtyId:item.specialtyId,count:item.count,rate:item.rate,unit:"hour",scenarioId:item.scenarioId})),
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
