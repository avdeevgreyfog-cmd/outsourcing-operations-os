import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {getWorkerTimesheet} from "@/lib/operations/worker-timesheet";
import {validTimesheetMonth} from "@/lib/operations/worker-timesheet.mjs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
  const {id}=await params;const month=new URL(request.url).searchParams.get("month")??new Date().toISOString().slice(0,7);
  if(!z.string().uuid().safeParse(id).success||!validTimesheetMonth(month))return NextResponse.json({error:"Проверьте сотрудника и месяц"},{status:400});
  const data=await getWorkerTimesheet(actor,id,month);
  return NextResponse.json(data??{error:"Сотрудник не найден"},{status:data?200:404,headers:{"Cache-Control":"private, no-store"}});
 }catch(error){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Не удалось загрузить табель"},{status:500});}
}
