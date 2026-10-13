import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {quickStartImport,quickStartImportSchema,QuickStartImportError} from "@/lib/operations/quick-start-import";
const schema=z.object({action:z.enum(["preview","commit"]),payload:quickStartImportSchema,digest:z.string().length(64).optional()});
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
  const body=schema.parse(await request.json());
  return NextResponse.json(await quickStartImport(actor,body.payload,body.action,body.digest));
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте обязательные поля и формат строк",issues:error.issues.map(issue=>({path:issue.path.map((part,index)=>typeof part==="number"?`строка ${part+2}`:({objects:"Объекты",workers:"Сотрудники",assignments:"Назначения",hours:"Часы",key:"Ключ",name:"Название",fullName:"ФИО",date:"Дата",startDate:"Дата назначения",specialtyId:"Специальность",kind:"Вид смены",status:"Статус"} as Record<string,string>)[String(part)]??(index===0?String(part):"Значение")),message:"Не указано обязательное значение или неверный формат"}))},{status:400});
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
  if(error instanceof QuickStartImportError)return NextResponse.json({error:error.message},{status:409});
  console.error("quick-start-import",error);return NextResponse.json({error:"Импорт не выполнен. Изменения отменены."},{status:500});
 }
}
