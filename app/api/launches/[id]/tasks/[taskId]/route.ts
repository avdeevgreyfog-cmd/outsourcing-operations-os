import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  title:z.string().trim().min(2).max(240).optional(),
  category:z.string().trim().min(1).max(40).optional(),
  ownerUserId:z.string().uuid().nullable().optional(),
  startDate:z.string().date().optional(),
  endDate:z.string().date().optional(),
  progress:z.number().min(0).max(100).optional(),
  status:z.enum(["planned","in_progress","blocked","done","cancelled"]).optional(),
  risk:z.enum(["normal","watch","high","critical"]).optional(),
  milestone:z.boolean().optional(),
  blocksLaunch:z.boolean().optional(),
  dependencyIds:z.array(z.string().uuid()).max(30).optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;taskId:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо изменения задачи применяются только локально"},{status:409});
    const {id,taskId}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[];startDate:string;endDate:string}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
          t.start_date::text "startDate",t.end_date::text "endDate"
        FROM launch_tasks t JOIN launches l ON l.id=t.launch_id JOIN objects o ON o.id=l.object_id
        WHERE l.id=${id}::uuid AND t.id=${taskId}::uuid
        FOR UPDATE
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      if(body.ownerUserId){
        const [owner]=await tx<Array<{id:string}>>`
          SELECT m.user_id id FROM organization_memberships m
          WHERE m.organization_id=${actor.organizationId}::uuid AND m.user_id=${body.ownerUserId}::uuid AND m.status='active' LIMIT 1
        `;
        if(!owner)throw new Error("Ответственный недоступен");
      }
      const start=body.startDate??scope.startDate;const end=body.endDate??scope.endDate;
      if(end<start)throw new Error("Дата окончания раньше даты начала");
      if(body.dependencyIds!==undefined){
        const dependencies=[...new Set(body.dependencyIds)];
        if(dependencies.includes(taskId))throw new Error("Задача не может зависеть сама от себя");
        if(dependencies.length){
          const [available]=await tx<Array<{count:number}>>`
            SELECT count(*)::int count FROM launch_tasks WHERE launch_id=${id}::uuid AND id=ANY(${dependencies}::uuid[])
          `;
          if((available?.count??0)!==dependencies.length)throw new Error("Одна из зависимостей недоступна в этом плане запуска");
          const [cycle]=await tx<Array<{count:number}>>`
            WITH RECURSIVE downstream(id) AS (
              SELECT successor_task_id FROM launch_task_dependencies WHERE predecessor_task_id=${taskId}::uuid
              UNION
              SELECT d.successor_task_id FROM launch_task_dependencies d JOIN downstream x ON d.predecessor_task_id=x.id
            )
            SELECT count(*)::int count FROM downstream WHERE id=ANY(${dependencies}::uuid[])
          `;
          if((cycle?.count??0)>0)throw new Error("Такая зависимость создаст цикл в плане запуска");
        }
        await tx`DELETE FROM launch_task_dependencies WHERE successor_task_id=${taskId}::uuid`;
        if(dependencies.length){
          await tx`
            INSERT INTO launch_task_dependencies(organization_id,predecessor_task_id,successor_task_id,dependency_type,created_by_user_id)
            SELECT ${actor.organizationId}::uuid,dep,${taskId}::uuid,'finish_to_start',${actor.userId}::uuid
            FROM unnest(${dependencies}::uuid[]) dep
          `;
        }
      }
      const [row]=await tx<Array<{id:string}>>`
        UPDATE launch_tasks SET
          title=COALESCE(${body.title??null},title),
          category=COALESCE(${body.category??null},category),
          owner_user_id=CASE WHEN ${body.ownerUserId===undefined} THEN owner_user_id ELSE ${body.ownerUserId??null}::uuid END,
          start_date=${start}::date,
          end_date=${end}::date,
          progress_pct=CASE WHEN ${body.status??null}='done' THEN 100 ELSE COALESCE(${body.progress??null}::numeric,progress_pct) END,
          status=COALESCE(${body.status??null},status),
          risk_level=COALESCE(${body.risk??null},risk_level),
          is_milestone=COALESCE(${body.milestone??null}::boolean,is_milestone),
          task_kind=CASE WHEN ${body.milestone===undefined} THEN task_kind WHEN ${body.milestone??false} THEN 'milestone' ELSE 'task' END,
          blocks_launch=COALESCE(${body.blocksLaunch??null}::boolean,blocks_launch),
          is_critical=COALESCE(${body.blocksLaunch??null}::boolean,is_critical),
          updated_at=now()
        WHERE id=${taskId}::uuid AND launch_id=${id}::uuid
        RETURNING id
      `;
      await tx`
        UPDATE launches l SET forecast_date=GREATEST(
          l.target_date,
          COALESCE((SELECT max(t.end_date) FROM launch_tasks t WHERE t.launch_id=l.id AND t.blocks_launch AND t.status NOT IN ('done','cancelled')),l.target_date)
        ) WHERE l.id=${id}::uuid
      `;
      return row;
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте задачу",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить задачу"},{status:500});
  }
}
