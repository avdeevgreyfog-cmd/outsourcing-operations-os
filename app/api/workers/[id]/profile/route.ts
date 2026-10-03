import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {listWorkers} from "@/lib/data/service";
import {withTenant} from "@/lib/db/client";
import {workerProfileSchema} from "@/lib/operations/worker-profile-schema";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
    requireCapability(actor,"worker.edit");
    const {id}=await params;if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Сотрудник не найден"},{status:404});
    const worker=(await listWorkers(actor)).find(row=>row.id===id);
    if(!worker||!canReadRow(actor.access,"worker.edit",worker,actor))throw new AccessDeniedError("worker.edit");
    if(actor.demo)return NextResponse.json({error:"Демо-изменения доступны только на текущем экране"},{status:409});
    const body=workerProfileSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [existing]=await tx<Array<{revision:string;organizationId:string;createdByUserId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.updated_at::text revision,w.organization_id "organizationId",w.created_by_user_id "createdByUserId",
          a.object_id "objectId",o.region_id "regionId",o.client_company_id "clientId",COALESCE(o.owner_user_id,a.manager_user_id) "ownerUserId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) || ARRAY[COALESCE(o.owner_user_id,a.manager_user_id)::text] "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL(SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id
        WHERE w.id=${id}::uuid AND w.organization_id=${actor.organizationId}::uuid FOR UPDATE OF w
      `;
      if(!existing)return {status:404,error:"Сотрудник не найден"};
      if(!canReadRow(actor.access,"worker.edit",existing,actor))throw new AccessDeniedError("worker.edit");
      if(existing.revision!==body.revision)return {status:409,error:"Карточка уже изменена. Обновите страницу перед сохранением."};
      if(body.contacts!==undefined){
        const [schema]=await tx<Array<{ready:boolean}>>`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='worker_profiles' AND column_name='contact_methods') ready`;
        if(!schema.ready)return {status:409,error:"Дополнительные контакты ещё не подключены к базе. ФИО, телефон и почту можно сохранить отдельно."};
      }
      if(body.phone){
        const [duplicate]=await tx`SELECT id FROM worker_profiles WHERE organization_id=${actor.organizationId}::uuid AND id<>${id}::uuid AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=regexp_replace(${body.phone},'[^0-9]','','g') LIMIT 1`;
        if(duplicate)return {status:409,error:"Этот основной телефон уже указан у другого сотрудника."};
      }
      await tx`UPDATE worker_profiles SET full_name=${body.fullName},phone=${body.phone||null},email=${body.email},updated_at=clock_timestamp() WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid`;
      if(body.contacts!==undefined)await tx`UPDATE worker_profiles SET contact_methods=${tx.json(body.contacts)} WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'profile_updated','Обновлены профиль и контакты сотрудника',${tx.json({fields:["fullName","phone","email",...(body.contacts!==undefined?["contacts"]:[])]})})`;
      const [updated]=await tx<Array<{revision:string}>>`SELECT updated_at::text revision FROM worker_profiles WHERE id=${id}::uuid`;
      return {status:200,revision:updated.revision};
    }));
    return NextResponse.json(result.error?{error:result.error}:{ok:true,revision:result.revision},{status:result.status});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message??"Проверьте контакты"},{status:400});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить профиль"},{status:500});
  }
}
