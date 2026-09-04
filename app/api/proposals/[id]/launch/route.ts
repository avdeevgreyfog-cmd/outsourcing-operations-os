import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(240).optional(),code:z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional()});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.proposal.launch");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [source]=await tx<Array<{proposalId:string;requestId:string;proposalStatus:string;scenarioIds:string[];organizationId:string;clientId:string|null;regionId:string|null;ownerUserId:string|null;createdByUserId:string;teamId:string|null;title:string;location:string|null;startDate:string|null}>>`
        SELECT p.id "proposalId",p.request_id "requestId",p.status "proposalStatus",p.scenario_ids "scenarioIds",r.organization_id "organizationId",r.client_company_id "clientId",
          r.region_id "regionId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
          COALESCE(NULLIF(p.content_snapshot->>'title',''),r.title) title,
          COALESCE(NULLIF(p.content_snapshot->>'location',''),r.location_text) location,
          COALESCE(NULLIF(p.content_snapshot->>'expectedStartDate',''),r.expected_start_date::text) "startDate"
        FROM proposals p JOIN requests r ON r.id=p.request_id WHERE p.id=${id}::uuid FOR UPDATE
      `;
      if(!source)throw new Error("КП не найдено");
      if(!canReadRow(actor.access,"sales.proposal.launch",source,actor))throw new AccessDeniedError("sales.proposal.launch");
      if(source.proposalStatus!=="accepted")throw new Error("Объект создаётся только из принятого клиентом КП");
      if(!source.clientId)throw new Error("Перед запуском привяжите заявку к клиенту");
      if(!source.regionId)throw new Error("Перед запуском укажите регион заявки");
      if(!source.scenarioIds.length)throw new Error("В принятой версии КП нет зафиксированных сценариев расчёта");
      const [existing]=await tx<Array<{id:string;name:string;code:string}>>`SELECT id,name,code FROM objects WHERE source_proposal_id=${id}::uuid`;
      if(existing)return {...existing,alreadyExists:true};

      const [resolved]=await tx<Array<{userId:string}>>`
        SELECT user_id "userId" FROM resolve_organization_responsibility('object_launch','owner','region',${source.regionId}::uuid,current_date) LIMIT 1
      `;
      if(!resolved?.userId)throw new Error("Не определён ответственный за запуск объекта. Настройте правило ответственности object_launch / owner для региона заявки");
      const ownerUserId=resolved.userId;
      const generatedCode=body.code??`OBJ-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;
      const [object]=await tx<Array<{id:string;name:string;code:string}>>`
        INSERT INTO objects(organization_id,client_company_id,source_request_id,source_proposal_id,name,code,status,region_id,address_text,target_start_date,owner_user_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${source.clientId}::uuid,${source.requestId}::uuid,${id}::uuid,${body.name??source.title},${generatedCode},'launch',${source.regionId}::uuid,${source.location??null},${source.startDate??null}::date,${ownerUserId}::uuid,${actor.userId}::uuid)
        RETURNING id,name,code
      `;
      await tx`
        INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
        VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${ownerUserId}::uuid,'launch_owner',current_date,${actor.userId}::uuid)
      `;
      await tx`
        INSERT INTO launches(organization_id,object_id,target_date,forecast_date,progress_pct,risk_level,checklist_json,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${object.id}::uuid,COALESCE(${source.startDate??null}::date,current_date),COALESCE(${source.startDate??null}::date,current_date),0,'normal','[]'::jsonb,${actor.userId}::uuid)
      `;
      await tx`
        INSERT INTO needs(organization_id,object_id,source_request_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id)
        SELECT rr.organization_id,${object.id}::uuid,rr.id,rr.specialty_id,rr.count_required,0,COALESCE(${source.startDate??null}::date,current_date),'open',${ownerUserId}::uuid,${actor.userId}::uuid
        FROM request_roles rr WHERE rr.request_id=${source.requestId}::uuid
      `;
      await tx`
        INSERT INTO client_rates(organization_id,client_company_id,object_id,specialty_id,accepted_scenario_id,amount,unit,effective_from,created_by_user_id)
        SELECT ${actor.organizationId}::uuid,${source.clientId}::uuid,${object.id}::uuid,rr.specialty_id,cs.id,
          COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,rr.target_client_rate,0),'hour',COALESCE(${source.startDate??null}::date,current_date),${actor.userId}::uuid
        FROM calculation_scenarios cs
        JOIN calculations c ON c.id=cs.calculation_id
        JOIN request_roles rr ON rr.id=cs.request_role_id
        WHERE cs.id=ANY(${source.scenarioIds}::uuid[]) AND c.request_id=${source.requestId}::uuid AND rr.request_id=${source.requestId}::uuid
      `;
      const [rateCount]=await tx<Array<{count:number}>>`SELECT count(*)::int count FROM client_rates WHERE object_id=${object.id}::uuid`;
      const [needCount]=await tx<Array<{count:number}>>`SELECT count(*)::int count FROM needs WHERE object_id=${object.id}::uuid`;
      if((rateCount?.count??0)!==(needCount?.count??0))throw new Error("Принятая версия КП не покрывает все позиции заявки; запуск отменён");
      await tx`UPDATE proposals SET launched_at=now() WHERE id=${id}::uuid`;
      await tx`UPDATE requests SET status='launched',updated_at=now() WHERE id=${source.requestId}::uuid`;
      return {...object,alreadyExists:false};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры объекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
