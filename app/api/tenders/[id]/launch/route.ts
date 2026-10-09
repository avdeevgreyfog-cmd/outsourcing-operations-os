import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
import {defaultPrimarySiteVisitChecklist} from "@/lib/operations/launch-checklist";
import {validateTenderLaunchPricing} from "@/lib/tenders/handoff.mjs";

const schema=z.object({
  name:z.string().trim().min(2).max(240).optional(),
  code:z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
  legalEntityId:z.string().uuid().optional(),
  targetStartDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type SourceRow={
  tenderId:string;organizationId:string;clientId:string|null;regionId:string|null;legalEntityId:string|null;
  ownerUserId:string|null;createdByUserId:string;teamId:string|null;title:string;stage:string;result:string|null;
  conditions:Record<string,unknown>;
};
type RoleScenario={
  roleId:string;title:string;countRequired:number|null;specialtyId:string|null;scenarioId:string|null;
  volume:number|string|null;roleBillingUnit:string;scenarioBillingUnit:string|null;billingUnit:string;
  clientRateNet:number|string|null;clientRateGross:number|string|null;vatPct:number|string|null;
};
type FinalBidRound={id:string;roundNumber:number;bidValue:number|string;priceVatMode:string};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.launch");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());

    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [source]=await tx<Array<SourceRow>>`
        SELECT t.id "tenderId",t.organization_id "organizationId",t.client_company_id "clientId",t.region_id "regionId",
          t.legal_entity_id "legalEntityId",t.owner_user_id "ownerUserId",t.created_by_user_id "createdByUserId",
          t.assigned_team_id "teamId",t.title,t.stage,t.result,t.conditions_json conditions
        FROM tenders t WHERE t.id=${id}::uuid FOR UPDATE
      `;
      if(!source)throw new Error("Тендер не найден");
      if(!canReadRow(actor.access,"sales.tender.launch",source,actor))throw new AccessDeniedError("sales.tender.launch");
      if(source.stage!=="completed"||source.result!=="won")throw new Error("Перед передачей в запуск зафиксируйте результат «Выиграли»");
      if(!source.clientId)throw new Error("Перед передачей в запуск привяжите тендер к клиенту");
      if(!source.regionId)throw new Error("Перед передачей в запуск укажите регион тендера");

      const [existing]=await tx<Array<{contractId:string;objectId:string|null;name:string|null;code:string|null}>>`
        SELECT c.id "contractId",c.object_id "objectId",o.name,o.code
        FROM contracts c LEFT JOIN objects o ON o.id=c.object_id
        WHERE c.tender_id=${id}::uuid AND c.parent_contract_id IS NULL
        ORDER BY c.created_at LIMIT 1
      `;
      if(existing)return {...existing,alreadyExists:true};

      const [calculation]=await tx<Array<{id:string;version:number}>>`
        SELECT id,version FROM calculations
        WHERE tender_id=${id}::uuid AND status='approved'
        ORDER BY version DESC,created_at DESC LIMIT 1
      `;
      if(!calculation)throw new Error("Для выигранного тендера нужен утверждённый расчёт экономики");

      const roles=await tx<RoleScenario[]>`
        SELECT tr.id "roleId",tr.title,tr.count_required "countRequired",tr.specialty_id "specialtyId",
          tr.volume,tr.billing_unit "roleBillingUnit",cs.id "scenarioId",cs.result_snapshot->>'billingUnit' "scenarioBillingUnit",
          COALESCE(cs.result_snapshot->>'billingUnit',tr.billing_unit) "billingUnit",
          COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,tr.target_client_rate) "clientRateNet",
          (cs.result_snapshot->>'clientRateGross')::numeric "clientRateGross",
          (cs.result_snapshot->>'vatPct')::numeric "vatPct"
        FROM tender_roles tr
        LEFT JOIN calculation_scenarios cs
          ON cs.tender_role_id=tr.id AND cs.calculation_id=${calculation.id}::uuid AND cs.status='accepted'
        WHERE tr.tender_id=${id}::uuid
        ORDER BY tr.created_at
      `;
      if(!roles.length)throw new Error("В тендере нет позиций для запуска");
      const missingSpecialty=roles.find(role=>!role.specialtyId);
      if(missingSpecialty)throw new Error(`Для позиции «${missingSpecialty.title}» не выбрана специальность`);
      const missingCount=roles.find(role=>!role.countRequired||role.countRequired<=0);
      if(missingCount)throw new Error(`Для позиции «${missingCount.title}» не указано количество сотрудников`);
      const missingScenario=roles.find(role=>!role.scenarioId);
      if(missingScenario)throw new Error(`В утверждённой версии расчёта нет принятого сценария для позиции «${missingScenario.title}»`);
      const missingRate=roles.find(role=>role.clientRateNet==null||Number(role.clientRateNet)<=0);
      if(missingRate)throw new Error(`В принятом сценарии позиции «${missingRate.title}» нет клиентской ставки`);

      const [finalBidRound]=await tx<Array<FinalBidRound>>`
        SELECT id,round_number "roundNumber",bid_value "bidValue",price_vat_mode "priceVatMode"
        FROM tender_bid_rounds
        WHERE tender_id=${id}::uuid
        ORDER BY round_number DESC,occurred_at DESC
        LIMIT 1
      `;
      if(!finalBidRound)throw new Error("Перед передачей в запуск зафиксируйте финальную цену во вкладке «Подача» или «Торги»");
      const pricing=validateTenderLaunchPricing({
        bidValue:finalBidRound.bidValue,
        priceVatMode:finalBidRound.priceVatMode,
        roles,
      });
      if(pricing.status!=="aligned")throw new Error(
        `Финальная экономика не готова к запуску. ${pricing.missing[0]??"Сверьте выигрышную цену и ставки по позициям"}`
      );

      const legalEntities=await tx<Array<{id:string;primary:boolean}>>`
        SELECT id,is_primary "primary" FROM legal_entities WHERE active ORDER BY is_primary DESC,name
      `;
      let legalEntityId=body.legalEntityId??source.legalEntityId??null;
      if(legalEntityId&&!legalEntities.some(item=>item.id===legalEntityId))throw new Error("Выбранное юридическое лицо недоступно");
      if(!legalEntityId&&legalEntities.length===1)legalEntityId=legalEntities[0].id;
      if(!legalEntityId&&legalEntities.length>1)throw new Error("Выберите юридическое лицо, от которого будет работать объект");
      if(!legalEntityId)throw new Error("В настройках компании нет активного юридического лица");

      const [resolved]=await tx<Array<{userId:string}>>`
        SELECT user_id "userId" FROM resolve_organization_responsibility('object_launch','owner','region',${source.regionId}::uuid,current_date) LIMIT 1
      `;
      if(!resolved?.userId)throw new Error("Не определён ответственный за подготовку объекта. Настройте правило ответственности object_launch / owner для региона тендера");
      const ownerUserId=resolved.userId;

      const [recruitingOwner]=await tx<Array<{userId:string;teamId:string|null}>>`
        WITH routed AS (
          SELECT user_id "userId",NULL::uuid "teamId",1 priority
          FROM resolve_organization_responsibility('recruiting_need','owner','region',${source.regionId}::uuid,current_date)
          LIMIT 1
        ), fallback AS (
          SELECT m.user_id "userId",m.primary_team_id "teamId",2 priority
          FROM organization_memberships m
          JOIN role_templates rt ON rt.id=m.role_template_id AND rt.code='recruiter'
          LEFT JOIN membership_regions mr ON mr.membership_id=m.id AND mr.region_id=${source.regionId}::uuid
          WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
          ORDER BY (mr.region_id IS NOT NULL) DESC,m.created_at
          LIMIT 1
        )
        SELECT "userId","teamId" FROM (SELECT * FROM routed UNION ALL SELECT * FROM fallback) x
        WHERE "userId" IS NOT NULL ORDER BY priority LIMIT 1
      `;
      const needOwnerUserId=recruitingOwner?.userId??ownerUserId;
      const generatedCode=body.code??`OBJ-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;

      const [object]=await tx<Array<{id:string;name:string;code:string}>>`
        INSERT INTO objects(
          organization_id,client_company_id,legal_entity_id,source_tender_id,name,code,status,region_id,target_start_date,owner_user_id,created_by_user_id
        ) VALUES(
          ${actor.organizationId}::uuid,${source.clientId}::uuid,${legalEntityId}::uuid,${id}::uuid,
          ${body.name??source.title},${generatedCode},'prelaunch',${source.regionId}::uuid,${body.targetStartDate??null}::date,
          ${ownerUserId}::uuid,${actor.userId}::uuid
        )
        RETURNING id,name,code
      `;

      await tx`
        INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
        VALUES
          (${actor.organizationId}::uuid,${object.id}::uuid,${ownerUserId}::uuid,'object_manager',current_date,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${object.id}::uuid,${ownerUserId}::uuid,'launch_owner',current_date,${actor.userId}::uuid)
      `;

      const [launch]=await tx<Array<{id:string;targetDate:string}>>`
        INSERT INTO launches(organization_id,object_id,target_date,forecast_date,progress_pct,risk_level,checklist_json,phase,created_by_user_id)
        VALUES(
          ${actor.organizationId}::uuid,${object.id}::uuid,COALESCE(${body.targetStartDate??null}::date,current_date+14),
          COALESCE(${body.targetStartDate??null}::date,current_date+14),0,'normal','[]'::jsonb,'preparation',${actor.userId}::uuid
        )
        RETURNING id,target_date::text "targetDate"
      `;

      await tx`
        INSERT INTO launch_tasks(organization_id,launch_id,title,owner_user_id,start_date,end_date,baseline_start,baseline_end,progress_pct,status,risk_level,is_milestone,is_critical,category,task_kind,blocks_launch,created_by_user_id)
        VALUES
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Передача проекта в запуск',${ownerUserId}::uuid,current_date,current_date,current_date,current_date,0,'planned','normal',false,false,'other','task',false,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Договорная готовность',${ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-2),current_date,GREATEST(current_date,${launch.targetDate}::date-2),0,'planned','watch',false,true,'contracts','task',true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Уточнить порядок доступа и вывода сотрудников',${ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-7),current_date,GREATEST(current_date,${launch.targetDate}::date-7),0,'planned','watch',false,true,'access','task',true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Комплектация персоналом',${needOwnerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-1),current_date,GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,true,'staffing','task',true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'СИЗ, форма и инструмент готовы',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date-7),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-7),GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,true,'supply','task',true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Подготовить графики и учёт рабочего времени',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date-5),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-5),GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,true,'operations','task',true,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Готовность к первому выходу',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',true,false,'operations','milestone',false,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Первый выход',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date),0,'planned','normal',true,false,'operations','milestone',false,${actor.userId}::uuid),
          (${actor.organizationId}::uuid,${launch.id}::uuid,'Стабилизация запуска',${ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date+7),GREATEST(current_date,${launch.targetDate}::date),GREATEST(current_date,${launch.targetDate}::date+7),0,'planned','normal',false,false,'operations','task',false,${actor.userId}::uuid)
      `;

      await tx`
        INSERT INTO launch_task_dependencies(organization_id,predecessor_task_id,successor_task_id,dependency_type,created_by_user_id)
        SELECT ${actor.organizationId}::uuid,p.id,s.id,'finish_to_start',${actor.userId}::uuid
        FROM launch_tasks p JOIN launch_tasks s ON s.launch_id=p.launch_id
        WHERE p.launch_id=${launch.id}::uuid AND (p.title,s.title) IN (
          ('Передача проекта в запуск','Договорная готовность'),
          ('Передача проекта в запуск','Уточнить порядок доступа и вывода сотрудников'),
          ('Передача проекта в запуск','Комплектация персоналом'),
          ('Передача проекта в запуск','СИЗ, форма и инструмент готовы'),
          ('Передача проекта в запуск','Подготовить графики и учёт рабочего времени'),
          ('Договорная готовность','Готовность к первому выходу'),
          ('Уточнить порядок доступа и вывода сотрудников','Готовность к первому выходу'),
          ('Комплектация персоналом','Готовность к первому выходу'),
          ('СИЗ, форма и инструмент готовы','Готовность к первому выходу'),
          ('Подготовить графики и учёт рабочего времени','Готовность к первому выходу'),
          ('Готовность к первому выходу','Первый выход'),
          ('Первый выход','Стабилизация запуска')
        )
      `;

      const needs=await tx<Array<{id:string;countRequired:number;specialtyId:string}>>`
        INSERT INTO needs(
          organization_id,object_id,source_tender_role_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,created_by_user_id
        )
        SELECT tr.organization_id,${object.id}::uuid,tr.id,tr.specialty_id,tr.count_required,0,
          GREATEST(current_date,COALESCE(${body.targetStartDate??null}::date,current_date+14)-3),'open',
          ${needOwnerUserId}::uuid,${actor.userId}::uuid
        FROM tender_roles tr WHERE tr.tender_id=${id}::uuid
        RETURNING id,count_required "countRequired",specialty_id "specialtyId"
      `;

      await tx`
        INSERT INTO launch_site_visits(organization_id,launch_id,visit_type,scheduled_date,owner_user_id,status,checklist_json,created_by_user_id)
        VALUES(
          ${actor.organizationId}::uuid,${launch.id}::uuid,'primary',
          GREATEST(current_date,${launch.targetDate}::date-10),${ownerUserId}::uuid,'planned',
          ${tx.json(defaultPrimarySiteVisitChecklist())},${actor.userId}::uuid
        )
      `;

      for(const need of needs){
        const total=Math.max(1,Number(need.countRequired||1));
        const waveCount=total<=4?1:total<=10?2:3;
        const base=Math.floor(total/waveCount);
        const extra=total%waveCount;
        for(let index=0;index<waveCount;index++){
          const plannedCount=base+(index<extra?1:0);
          const offset=waveCount===1?0:Math.round(-14+(14*index/(waveCount-1)));
          const name=waveCount===1?"Полный состав":index===waveCount-1?"Полный состав":`Волна ${index+1}`;
          await tx`
            INSERT INTO launch_staffing_waves(
              organization_id,launch_id,name,target_date,planned_count,specialty_id,need_id,note,status,created_by_user_id
            ) VALUES(
              ${actor.organizationId}::uuid,${launch.id}::uuid,${name},
              GREATEST(current_date,${launch.targetDate}::date+${offset}::int),${plannedCount},
              ${need.specialtyId}::uuid,${need.id}::uuid,'Базовый план вывода, можно изменить','planned',${actor.userId}::uuid
            )
          `;
        }
      }

      await tx`
        INSERT INTO client_rates(
          organization_id,client_company_id,object_id,specialty_id,accepted_scenario_id,amount,unit,pricing_snapshot,effective_from,created_by_user_id
        )
        SELECT ${actor.organizationId}::uuid,${source.clientId}::uuid,${object.id}::uuid,tr.specialty_id,cs.id,
          COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,tr.target_client_rate,0),
          CASE COALESCE(cs.result_snapshot->>'billingUnit',tr.billing_unit)
            WHEN 'hour' THEN 'hour' WHEN 'shift' THEN 'shift' WHEN 'worker_month' THEN 'month'
            WHEN 'project_month' THEN 'month'
            WHEN 'mixed' THEN CASE COALESCE(cs.result_snapshot->>'variableBillingUnit','hour') WHEN 'hour' THEN 'hour' WHEN 'shift' THEN 'shift' ELSE 'service' END
            ELSE 'service' END,
          jsonb_build_object(
            'scenarioId',cs.id,'calculationId',${calculation.id}::uuid,'calculationVersion',${calculation.version},
            'billingUnit',COALESCE(cs.result_snapshot->>'billingUnit',tr.billing_unit),
            'variableBillingUnit',cs.result_snapshot->'variableBillingUnit',
            'clientRateNet',COALESCE(cs.result_snapshot->'clientRateNet',cs.result_snapshot->'clientRateHourly'),
            'clientRateGross',cs.result_snapshot->'clientRateGross','vatPct',cs.result_snapshot->'vatPct',
            'fixedMonthlyNet',cs.result_snapshot->'fixedMonthlyNet','minimumMonthlyNet',cs.result_snapshot->'minimumMonthlyNet',
            'monthlyRevenueNet',cs.result_snapshot->'monthlyRevenueNet','projectMonths',cs.result_snapshot->'projectMonths'
          ),
          COALESCE(${body.targetStartDate??null}::date,current_date),${actor.userId}::uuid
        FROM tender_roles tr
        JOIN calculation_scenarios cs ON cs.tender_role_id=tr.id
        WHERE tr.tender_id=${id}::uuid AND cs.calculation_id=${calculation.id}::uuid AND cs.status='accepted'
      `;
      const [rateCount]=await tx<Array<{count:number}>>`
        SELECT count(*)::int count FROM client_rates WHERE object_id=${object.id}::uuid
      `;
      if((rateCount?.count??0)!==needs.length)throw new Error("Утверждённый расчёт не покрывает все позиции тендера; передача в запуск отменена");

      const vatValues=roles.map(role=>role.vatPct==null?null:Number(role.vatPct)).filter((value):value is number=>value!=null);
      const vatPct=vatValues.length===roles.length&&new Set(vatValues).size===1?vatValues[0]:null;
      const roleSnapshot=roles.map(role=>({
        role:role.title,
        count:Number(role.countRequired),
        rateNet:Number(role.clientRateNet),
        rateGross:role.clientRateGross==null?undefined:Number(role.clientRateGross),
        unit:role.billingUnit,
        scenarioId:role.scenarioId??undefined,
      }));
      const terms=JSON.parse(JSON.stringify({
        vatMode:typeof source.conditions.vatMode==="string"?source.conditions.vatMode:null,
        vatPct,
        schedule:typeof source.conditions.schedule==="string"?source.conditions.schedule:null,
        projectDuration:typeof source.conditions.projectDuration==="string"?source.conditions.projectDuration:null,
        included:[],
        clientProvides:[],
        paymentTerms:null,
        paymentDelayDays:null,
        billingBasis:"Подтверждённый заказчиком табель / акт",
        timesheetRule:null,
        minimumVolume:null,
        sla:null,
        penalties:null,
        notes:null,
        roles:roleSnapshot,
        tenderSnapshot:{
          tenderId:id,
          calculationId:calculation.id,
          calculationVersion:calculation.version,
          scenarioIds:roles.map(role=>role.scenarioId),
          finalBidRoundId:finalBidRound.id,
          finalBidRoundNumber:finalBidRound.roundNumber,
          finalBidValue:Number(finalBidRound.bidValue),
          priceVatMode:finalBidRound.priceVatMode,
          winningRevenueNet:pricing.winningRevenueNet,
          scenarioRevenueNet:pricing.scenarioRevenueNet,
        },
      }));

      const [contract]=await tx<Array<{id:string}>>`
        INSERT INTO contracts(
          organization_id,client_company_id,legal_entity_id,request_id,tender_id,proposal_id,object_id,kind,status,title,owner_user_id,launch_gate,created_by_user_id
        ) VALUES(
          ${actor.organizationId}::uuid,${source.clientId}::uuid,${legalEntityId}::uuid,NULL,${id}::uuid,NULL,${object.id}::uuid,
          'master','draft',${`Договор · ${source.title}`},${source.ownerUserId??actor.userId}::uuid,'blocked',${actor.userId}::uuid
        ) RETURNING id
      `;

      const [contractVersion]=await tx<Array<{id:string}>>`
        INSERT INTO contract_versions(organization_id,contract_id,version,status,terms_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${contract.id}::uuid,1,'draft',${tx.json(terms)},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`UPDATE contracts SET current_version_id=${contractVersion.id}::uuid WHERE id=${contract.id}::uuid`;
      await tx`UPDATE objects SET contract_id=${contract.id}::uuid WHERE id=${object.id}::uuid`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(
          ${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${id}::uuid,'prelaunch_started',
          'Выигранный тендер передан в договор и подготовку объекта',
          ${tx.json({
            objectId:object.id,contractId:contract.id,needCount:needs.length,legalEntityId,
            calculationId:calculation.id,calculationVersion:calculation.version,
            finalBidRoundId:finalBidRound.id,winningRevenueNet:pricing.winningRevenueNet,
            scenarioRevenueNet:pricing.scenarioRevenueNet,
            recruitingRouteOwnerUserId:recruitingOwner?.userId??null,
          })}
        )
      `;

      return {
        ...object,
        objectId:object.id,
        contractId:contract.id,
        needCount:needs.length,
        legalEntityId,
        calculationId:calculation.id,
        calculationVersion:calculation.version,
        recruitingRouteOwnerUserId:recruitingOwner?.userId??null,
        alreadyExists:false,
      };
    }));

    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры запуска",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
