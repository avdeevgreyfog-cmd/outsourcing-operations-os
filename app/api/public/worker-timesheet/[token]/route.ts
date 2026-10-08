import {NextResponse} from "next/server";
import {z} from "zod";
import {employeePortal,submitEmployeeReply} from "@/lib/operations/worker-timesheet-portal";
const responseSchema=z.object({
 date:z.string().date(),response:z.enum(["working","day_off","cannot_work"]).optional(),
 kind:z.enum(["day","night","off"]).optional(),
 hours:z.number().min(0).max(24).optional(),
 reason:z.string().trim().max(250).optional()
});
const noStore={"Cache-Control":"no-store, private"};
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;const data=await employeePortal(token);
  return data?NextResponse.json(data,{headers:noStore}):NextResponse.json({error:"Ссылка недействительна или приостановлена"},{status:404,headers:noStore});
 }catch(error){console.error("employee timesheet context",error);return NextResponse.json({error:"Не удалось открыть табель"},{status:500,headers:noStore})}
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;const payload=responseSchema.parse(await request.json());
  const result=await submitEmployeeReply(token,payload);
  return NextResponse.json(result,{headers:noStore});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте ввод"},{status:400,headers:noStore});
  return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить ответ"},{status:400,headers:noStore});
 }
}
