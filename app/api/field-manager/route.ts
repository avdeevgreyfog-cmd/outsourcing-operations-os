import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {mobileManagerDesk,markMobileAttendance,markFirstDayStep} from "@/lib/operations/mobile-manager";

const attendance=z.object({action:z.literal("attendance"),objectId:z.string().uuid(),date:z.string().date(),kind:z.enum(["day","night"]),workerIds:z.array(z.string().uuid()).min(1).max(50),state:z.enum(["present","absent","pending"]),reason:z.string().max(500).nullable().optional()});
const firstDay=z.object({action:z.literal("first_day"),objectId:z.string().uuid(),workerId:z.string().uuid(),date:z.string().date(),checkpoint:z.enum(["met","pass_checked","documents_checked","briefing_checked","ppe_checked","started"]),state:z.enum(["done","issue"]).nullable(),note:z.string().max(500).nullable().optional()});
const schema=z.discriminatedUnion("action",[attendance,firstDay]);
export async function GET(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
  const date=new URL(request.url).searchParams.get("date")??undefined;
  const data=await mobileManagerDesk(actor,date);
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для просмотра"},{status:403});
  return NextResponse.json({error:error instanceof Error?error.message:"Не удалось загрузить данные"},{status:400});
 }
}
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
  const data=schema.parse(await request.json());
  const result=data.action==="attendance"
   ?await markMobileAttendance(actor,data.objectId,data.date,data.kind,data.workerIds,data.state,data.reason??null)
   :await markFirstDayStep(actor,data.objectId,data.workerId,data.date,data.checkpoint,data.state,data.note??null);
  return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте введённые данные"},{status:400});
  return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить"},{status:400});
 }
}
