import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {managerPortalData} from "@/lib/operations/worker-timesheet-portal";
import {withTenant} from "@/lib/db/client";
const schema=z.object({objectId:z.string().uuid(),workerId:z.string().uuid()});
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor({ignorePreview:true});
  if(!actor||actor.demo)return NextResponse.json({error:"Требуется вход менеджера"},{status:401});
  requireCapability(actor,"operations.shift.edit");
  const {objectId,workerId}=schema.parse(await request.json());
  const data=await managerPortalData(actor,objectId,workerId);
  if(!data.workers.some(x=>x.id===workerId&&x.objectId===objectId))return NextResponse.json({error:"Нет доступа к сотруднику"},{status:403});
  const link=data.links.find(x=>x.workerId===workerId&&x.objectId===objectId);
  await withTenant(actor.organizationId,actor.userId,async sql=>{
    if(link)await sql`UPDATE worker_timesheet_links SET last_manager_preview_at=now() WHERE id=${link.id}::uuid`;
    await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,actor_user_id,event_type)
      VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${link?.id??null}::uuid,${actor.userId}::uuid,'previewed_by_manager')`;
  });
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректный запрос"},{status:400});
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
  console.error("employee preview failed",{errorType:error instanceof Error?error.name:"unknown"});
  return NextResponse.json({error:"Не удалось открыть предпросмотр"},{status:500});
 }
}
