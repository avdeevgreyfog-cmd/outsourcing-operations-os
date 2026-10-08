import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {managerPortalData,editWorkerLink,editPortalSettings} from "@/lib/operations/worker-timesheet-portal";
const actions=z.discriminatedUnion("action",[
 z.object({action:z.enum(["create","rotate","pause","resume","revoke"]),objectId:z.string().uuid(),workerId:z.string().uuid()}),
 z.object({action:z.literal("settings"),objectId:z.string().uuid(),scheduleOwner:z.enum(["manager","client"])})
]);
export async function GET(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const url=new URL(request.url);
  return NextResponse.json(await managerPortalData(actor,url.searchParams.get("objectId")??undefined,url.searchParams.get("workerId")??undefined));
 }catch(error){console.error("worker confirmations GET",error);return NextResponse.json({error:"Не удалось загрузить подтверждения. Проверьте миграцию базы данных."},{status:500})}
}
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const body=actions.parse(await request.json());
  const result=body.action==="settings"
   ?await editPortalSettings(actor,body.objectId,body.scheduleOwner)
   :await editWorkerLink(actor,body.objectId,body.workerId,body.action);
  return NextResponse.json(result);
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные"},{status:400});
  if(error instanceof Error&&error.message.includes("Forbidden"))return NextResponse.json({error:"Недостаточно прав"},{status:403});
  return NextResponse.json({error:error instanceof Error?error.message:"Ошибка сохранения"},{status:400});
 }
}
