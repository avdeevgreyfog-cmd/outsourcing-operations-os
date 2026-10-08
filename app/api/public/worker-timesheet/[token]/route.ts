import {NextResponse} from "next/server";
import {z} from "zod";
import {employeePortal,submitEmployeeReply} from "@/lib/operations/worker-timesheet-portal";
import {employeePortalDetails,updateEmployeePortalDetails} from "@/lib/operations/employee-self-service";
import {employeePlanning,submitEmployeePlan,submitEmployeeWeek,submitEmployeePattern} from "@/lib/operations/employee-planning";
const responseSchema=z.object({
 date:z.string().date(),response:z.enum(["working","day_off","cannot_work"]).optional(),
 kind:z.enum(["day","night","off"]).optional(),
 hours:z.number().min(0).max(24).optional(),
 reason:z.string().trim().max(250).optional()
});
const detailsSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("sizes"),clothingSize:z.string().trim().max(40).nullable(),shoeSize:z.string().trim().max(40).nullable()}),
 z.object({action:z.literal("document"),code:z.string().max(40),reported:z.boolean()}),
 z.object({action:z.literal("shift_time"),date:z.string().date(),kind:z.enum(["day","night"]).optional(),startTime:z.string().regex(/^\d{2}:\d{2}$/),endTime:z.string().regex(/^\d{2}:\d{2}$/),endsNextDay:z.boolean(),appliesTo:z.enum(["single","regular"])})
]);
const planningSchema=z.object({action:z.literal("plan_day"),date:z.string().date(),kind:z.enum(["day","night","off"])});
const weekSchema=z.object({action:z.literal("plan_week"),weekStart:z.string().date(),offDates:z.array(z.string().date()).max(2)});
const patternSchema=z.object({action:z.literal("pattern_change"),effectiveFrom:z.string().date(),workDays:z.number().int().min(1).max(30),restDays:z.number().int().min(0).max(30),shiftKind:z.enum(["day","night"]),floatingDaysOff:z.boolean()});
const noStore={"Cache-Control":"no-store, private"};
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;const data=await employeePortal(token,new URL(request.url).searchParams.get("month")??undefined);
  return data?NextResponse.json({...data,...await (async()=>{const [details,planning]=await Promise.all([employeePortalDetails(token),employeePlanning(token)]);return {details,planning}})()},{headers:noStore}):NextResponse.json({error:"Ссылка недействительна или приостановлена"},{status:404,headers:noStore});
 }catch(error){console.error("employee timesheet context",error);return NextResponse.json({error:"Не удалось открыть табель"},{status:500,headers:noStore})}
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;const raw=await request.json();
  const result=raw&&typeof raw==="object"&&"action" in raw
    ?raw.action==="plan_week"
      ?await (async()=>{const input=weekSchema.parse(raw);return submitEmployeeWeek(token,input.weekStart,input.offDates)})()
      :raw.action==="pattern_change"
      ?await (async()=>{const input=patternSchema.parse(raw);return submitEmployeePattern(token,input)})()
      :raw.action==="plan_day"
      ?await (async()=>{const plan=planningSchema.parse(raw);return submitEmployeePlan(token,plan.date,plan.kind)})()
      :await updateEmployeePortalDetails(token,detailsSchema.parse(raw))
    :await submitEmployeeReply(token,responseSchema.parse(raw));
  return NextResponse.json(result,{headers:noStore});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте ввод"},{status:400,headers:noStore});
  return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить ответ"},{status:400,headers:noStore});
 }
}
