import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(240).optional(),code:z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional()});

type SourceRow={
  proposalId:string;requestId:string;proposalStatus:string;proposalVersion:number;scenarioIds:string[];content:Record<string,unknown>;
  organizationId:string;clientId:string|null;regionId:string|null;ownerUserId:string|null;createdByUserId:string;teamId:string|null;
  title:string;location:string|null;startDate:string|null;
};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.proposal.launch");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [source]=await tx<Array<SourceRow>>`
        SELECT p.id "proposalId",p.request_id "requestId",p.status "proposalStatus",p.version "proposalVersion",p.scenario_ids "scenarioIds",p.content_snapshot content,
          r.organization_id "organizationId",r.client_company_id "clientId",r.region_id "regionId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
          COALESCE(NULLIF(p.content_snapshot->>'objectName',''),NULLIF(p.content_snapshot->>'title',''),r.title) title,
          COALESCE(NULLIF(p.content_snapshot->>'location',''),r.location_text) location,
          COALESCE(NULLIF(p.content_snapshot->>'expectedStartDate',''),r.expected_start_date::text) "startDate"
        FROM proposals p JOIN requests r ON r.id=p.request_id WHERE p.id=${id}::uuid FOR UPDATE
      `;
      if(!source)throw new Error("КП не найдено");
      if(!canReadRow(actor.access,"sales.proposal.launch",source,actor))throw new AccessDeniedError("sales.proposal.launch");
      if(source.proposalStatus!=="accepted")throw new Error("Подготовку можно начать только после подтверждения коммерческих условий клиентом");
      if(!source.clientId)throw new Error("Перед подготовкой привяжите заявку к клиенту");
      if(!source.regionId)throw new Error("Перед подготовкой укажите регион заявки");
      if(!source.scenarioIds.length)throw new Error("В принятой версии КП нет зафиксированных сценариев расчёта");
      const [existing]=await tx<Array<{id:string;name:string;code:string;contractId:string|null}>>`SELECT id,name,code,contract_id "contractId" FROM objects WHERE source_proposal_id=${id}::uuid`;
      if(existing)return {...existing,alreadyExists:true};

      const [resolved]=await tx<Array<{userId:string}>>`
        SELECT user_id "userId" FROM resolve_organization_responsibility('object_launch','owner','region',${source.regionId}::uuid,current_date) LIMIT 1
      `;
      if(!resolved?.userId)throw new Error("Не определён ответственный за подготовку объекта. Настройте правило ответственности object_launch / owner для региона заявки");
      const ownerUserId=resolved.userId;
      const generatedCode=body.code??`OBJ-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;
      const [object]=await tx<Array<{id:string;name:string;code:string}>>`
        INSERT INTO objects(organization_id,client_company_id,source_request_id,source_proposal_id,name,code,status,region_id,address_text,target_start_date,owner_user_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${source.clientId}::uuid,${source.requestId}::uuid,${id}::uuid,${body.name??source.title},${generatedCode},'prelaunch',${source.regionId}::uuid,${source.location??null},${source.startDate??null}::date,${ownerUserId}::uuid,${actor.userId}::uuid)
        RETURNING id,name,code
      `;
      await tx`
        INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
        VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${ownerUserId}::uuid,'launch_owner',current_date,${actor.userId}::uuid)
      `;
      const [launch]=await tx<Array<{id:string;targetDate:string}>>`
        INSERT INTO launches(organization_id,object_id,target_date,forecast_date,progress_pct,risk_level,checklist_json,phase,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${object.id}::uuid,COALESCE(${source.startDate??null}::date,current_date+14),COALESCE(${source.startDate??null}::date,current_date+14),0,'normal','[]'::jsonb,'preparation',${actor.userId}::uuid)
        RETURNING id,target_date::text "targetDate"
      `;
      await tx`
        INSERT INTO launch_tasks(organization_id,launch_id,title,owner_user_id,start_date,end_date,baseline_start,baseline_end,progress_pct,status,risk_level,is_milestone,is_critical,created_by_user_id)
        VALUES
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Передача проекта в запуск',${ownerUserId}::uuid,current_date,current_date,current_date,current_date,0,'planned','normal',false,true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Договорная готовность',${ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-2),current_date,GREATEST(current_date,${launch.targetDate}::date-2),0,'planned','watch',false,true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Комплектация персоналом',${ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-1),current_date,GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Логистика и обеспечение',${ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-1),current_date,GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,false,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Готовность к первому выходу',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',true,true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Старт объекта',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),0,'planned','normal',true,true,${actor.userId}::uuid)
      `;
      await tx`
        INSERT INTO launch_task_dependencies(organization_id,predecessor_task_id,successor_task_id,dependency_type,created_by_user_id)
        SELECT ${actor.organizationId}::uuid,p.id,s.id,'finish_to_start',${actor.userId}::uuid
        FROM launch_tasks p JOIN launch_tasks s ON s.launch_id=p.launch_id
        WHERE p.launch_id=${launch.id}::uuid AND (p.title,s.title) IN (
          ('Передача проекта в запуск','Договорная готовность'),
          ('Передача проекта в запуск','Комплектация персоналом'),
          ('Передача проекта в запуск','Логистика и обеспечение'),
          ('Договорная готовность','Готовность к первому выходу'),
          ('Комплектация персоналом','Готовность к первому выходу'),
          ('Логистика и обеспечение','Готовность к первому выходу'),
          ('Готовность к первому выходу','Старт объекта')
        )
      `;
      await tx`
        INSERT INTO needs(organization_id,object_id,source_request_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id)
        SELECT rr.organization_id,${object.id}::uuid,rr.id,rr.specialty_id,rr.count_required,0,GREATEST(current_date,COALESCE(${source.startDate??null}::date,current_date+14)-3),'open',${ownerUserId}::uuid,${actor.userId}::uuid
        FROM request_roles rr WHERE rr.request_id=${source.requestId}::uuid
      `;
      await tx`
        INSERT INTO client_rates(organization_id,client_company_id,object_id,specialty_id,accepted_scenario_id,amount,unit,pricing_snapshot,effective_from,created_by_user_id)
        SELECT ${actor.organizationId}::uuid,${source.clientId}::uuid,${object.id}::uuid,rr.specialty_id,cs.id,
          COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,rr.target_client_rate,0),
          CASE COALESCE(cs.result_snapshot->>'billingUnit','hour')
            WHEN 'hour' THEN 'hour' WHEN 'shift' THEN 'shift' WHEN 'worker_month' THEN 'month' WHEN 'project_month' THEN 'month'
            WHEN 'mixed' THEN CASE COALESCE(cs.result_snapshot->>'variableBillingUnit','hour') WHEN 'hour' THEN 'hour' WHEN 'shift' THEN 'shift' ELSE 'service' END
            ELSE 'service' END,
          jsonb_build_object('scenarioId',cs.id,'billingUnit',COALESCE(cs.result_snapshot->>'billingUnit','hour'),'variableBillingUnit',cs.result_snapshot->'variableBillingUnit','clientRateNet',COALESCE(cs.result_snapshot->'clientRateNet',cs.result_snapshot->'clientRateHourly'),'clientRateGross',cs.result_snapshot->'clientRateGross','vatPct',cs.result_snapshot->'vatPct','fixedMonthlyNet',cs.result_snapshot->'fixedMonthlyNet','minimumMonthlyNet',cs.result_snapshot->'minimumMonthlyNet','monthlyRevenueNet',COALESCE(cs.result_snapshot->'monthlyRevenueNet',to_jsonb(COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0)*COALESCE((cs.inputs_snapshot->>'workers')::numeric,rr.count_required)*COALESCE((cs.inputs_snapshot->>'hoursPerWorker')::numeric,0))),'projectMonths',cs.result_snapshot->'projectMonths'),
          COALESCE(${source.startDate??null}::date,current_date),${actor.userId}::uuid
        FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id JOIN request_roles rr ON rr.id=cs.request_role_id
        WHERE cs.id=ANY(${source.scenarioIds}::uuid[]) AND c.request_id=${source.requestId}::uuid AND rr.request_id=${source.requestId}::uuid
      `;
      const [rateCount]=await tx<Array<{count:number}>>`SELECT count(*)::int count FROM client_rates WHERE object_id=${object.id}::uuid`;
      const [needCount]=await tx<Array<{count:number}>>`SELECT count(*)::int count FROM needs WHERE object_id=${object.id}::uuid`;
      if((rateCount?.count??0)!==(needCount?.count??0))throw new Error("Принятая версия КП не покрывает все позиции заявки; подготовка отменена");

      const terms={
        vatMode:source.content.vatMode??null,vatPct:source.content.vatPct??null,schedule:source.content.schedule??null,
        projectDuration:source.content.projectDuration??null,included:source.content.included??[],clientProvides:source.content.clientProvides??[],
        paymentTerms:null,paymentDelayDays:null,billingBasis:"Подтверждённый заказчиком табель / акт",timesheetRule:null,minimumVolume:null,sla:null,penalties:null,notes:null,
        roles:source.content.roles??[],proposalSnapshot:{proposalId:source.proposalId,proposalVersion:source.proposalVersion},
      };
      const [contract]=await tx<Array<{id:string}>>`
        INSERT INTO contracts(organization_id,client_company_id,request_id,proposal_id,object_id,kind,status,title,owner_user_id,launch_gate,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${source.clientId}::uuid,${source.requestId}::uuid,${source.proposalId}::uuid,${object.id}::uuid,'master','draft',${`Договор · ${source.title}`},${source.ownerUserId??actor.userId}::uuid,'blocked',${actor.userId}::uuid)
        RETURNING id
      `;
      const [contractVersion]=await tx<Array<{id:string}>>`
        INSERT INTO contract_versions(organization_id,contract_id,version,status,terms_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${contract.id}::uuid,1,'draft',${sql.json(terms)},${actor.userId}::uuid) RETURNING id
      `;
      await tx`UPDATE contracts SET current_version_id=${contractVersion.id}::uuid WHERE id=${contract.id}::uuid`;
      await tx`UPDATE objects SET contract_id=${contract.id}::uuid WHERE id=${object.id}::uuid`;
      await tx`UPDATE proposals SET prelaunch_at=now() WHERE id=${id}::uuid`;
      await tx`UPDATE requests SET status='prelaunch',updated_at=now() WHERE id=${source.requestId}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'proposal',${id}::uuid,'prelaunch_started','Начата параллельная подготовка: подбор, план запуска и договор',${sql.json({objectId:object.id,contractId:contract.id,needCount:needCount?.count??0})})`;
      return {...object,contractId:contract.id,needCount:needCount?.count??0,alreadyExists:false};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры объекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
