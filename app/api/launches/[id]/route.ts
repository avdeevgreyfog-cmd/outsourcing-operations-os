import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  targetDate:z.string().date().optional(),
  phase:z.enum(["preparation","ready","active","completed","cancelled"]).optional(),
  stabilizationDays:z.number().int().min(0).max(60).optional(),
  shiftLinked:z.boolean().default(false),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо изменения плана применяются только локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{id:string;organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[];targetDate:string;phase:string;contractGate:string|null}>>`
        SELECT l.id,l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          o.client_company_id "clientId",l.target_date::text "targetDate",l.phase,ct.launch_gate "contractGate",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM launches l JOIN objects o ON o.id=l.object_id
        LEFT JOIN contracts ct ON ct.id=o.contract_id
        WHERE l.id=${id}::uuid FOR UPDATE
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      if((body.phase==="ready"||body.phase==="active")){
        if(scope.contractGate==="blocked")throw new Error("Запуск заблокирован: договор ещё не подписан и нет согласованного исключения");
        const [blocking]=await tx<Array<{count:number}>>`
          SELECT count(*)::int count FROM launch_tasks
          WHERE launch_id=${id}::uuid AND blocks_launch AND status NOT IN ('done','cancelled')
        `;
        if((blocking?.count??0)>0)throw new Error(`Запуск заблокирован: не закрыто обязательных задач — ${blocking.count}`);
        const [visit]=await tx<Array<{count:number}>>`
          SELECT count(*)::int count FROM launch_site_visits
          WHERE launch_id=${id}::uuid AND visit_type='primary' AND status NOT IN ('completed','cancelled')
        `;
        if((visit?.count??0)>0)throw new Error("Запуск заблокирован: первичный выезд на объект не завершён");
      }
      if(body.phase==="completed"&&scope.phase!=="active")throw new Error("Завершить можно только запуск, который находится в фазе запуска / стабилизации");

      const nextTarget=body.targetDate??scope.targetDate;
      if(body.targetDate&&body.targetDate!==scope.targetDate&&body.shiftLinked){
        const [deltaRow]=await tx<Array<{days:number}>>`SELECT (${body.targetDate}::date-${scope.targetDate}::date)::int days`;
        const delta=deltaRow?.days??0;
        if(delta){
          await tx`UPDATE launch_tasks SET start_date=start_date+(${delta}::int*interval '1 day'),end_date=end_date+(${delta}::int*interval '1 day'),updated_at=now()
            WHERE launch_id=${id}::uuid AND status NOT IN ('done','cancelled')`;
          await tx`UPDATE launch_staffing_waves SET target_date=target_date+(${delta}::int*interval '1 day'),updated_at=now()
            WHERE launch_id=${id}::uuid AND status NOT IN ('completed','cancelled')`;
          await tx`UPDATE launch_site_visits SET scheduled_date=scheduled_date+(${delta}::int*interval '1 day'),updated_at=now()
            WHERE launch_id=${id}::uuid AND scheduled_date IS NOT NULL AND status NOT IN ('completed','cancelled')`;
        }
      }
      await tx`UPDATE launches SET
        target_date=${nextTarget}::date,
        forecast_date=CASE WHEN forecast_date IS NULL OR forecast_date=${scope.targetDate}::date THEN ${nextTarget}::date ELSE forecast_date END,
        phase=COALESCE(${body.phase??null},phase),
        stabilization_days=COALESCE(${body.stabilizationDays??null}::int,stabilization_days)
        WHERE id=${id}::uuid`;
      if(body.phase==="active"){
        await tx`UPDATE objects SET status='launch',actual_start_date=COALESCE(actual_start_date,current_date),updated_at=now() WHERE id=${scope.objectId}::uuid`;
        await tx`UPDATE launch_tasks SET status='done',progress_pct=100,updated_at=now() WHERE launch_id=${id}::uuid AND task_kind='milestone' AND lower(title) IN ('первый выход','старт объекта')`;
      }
      if(body.phase==="completed"){
        await tx`UPDATE objects SET status='active',actual_start_date=COALESCE(actual_start_date,current_date),updated_at=now() WHERE id=${scope.objectId}::uuid`;
        await tx`UPDATE launch_tasks SET status='done',progress_pct=100,updated_at=now() WHERE launch_id=${id}::uuid AND lower(title) LIKE '%стабилиз%'`;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'launch',${id}::uuid,'launch_plan_updated','Обновлён план запуска',${tx.json({targetDate:nextTarget,phase:body.phase??scope.phase,shiftLinked:body.shiftLinked})})`;
      return {id,targetDate:nextTarget,phase:body.phase??scope.phase};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры плана запуска",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить план запуска"},{status:500});
  }
}
