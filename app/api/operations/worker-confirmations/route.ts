import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {managerPortalData,editWorkerLink,reconcileEmployeeHours} from "@/lib/operations/worker-timesheet-portal";
import {employeeDetailManagerList,managerEmployeeDetailAction} from "@/lib/operations/employee-self-service";
import {managerSetScheduleOwner,managerEmployeePlanningChanges,managerReviewEmployeePlan,managerSetWorkerPattern,managerReviewPattern} from "@/lib/operations/employee-planning";
const actions=z.discriminatedUnion("action",[
 z.object({action:z.enum(["create","rotate","copy","pause","resume","revoke"]),objectId:z.string().uuid(),workerId:z.string().uuid()}),
 z.object({action:z.literal("settings"),objectId:z.string().uuid(),scheduleOwner:z.enum(["manager","worker"]),horizon:z.number().int().min(2).max(31).optional()}),
 z.object({action:z.literal("reconcile"),objectId:z.string().uuid(),fromDate:z.string().date(),toDate:z.string().date()}),
 z.object({action:z.literal("manager_phone"),objectId:z.string().uuid(),phone:z.string().max(50).nullable()}),
 z.object({action:z.literal("verify_document"),objectId:z.string().uuid(),workerId:z.string().uuid(),code:z.string().max(40),verified:z.boolean()}),
 z.object({action:z.literal("review_shift_time"),objectId:z.string().uuid(),workerId:z.string().uuid(),date:z.string().date(),approve:z.boolean()}),
 z.object({action:z.literal("document_requirement"),objectId:z.string().uuid(),relationType:z.enum(["employment","gph","npd","custom"]),code:z.string().max(40),required:z.boolean()}),
 z.object({action:z.literal("worker_schedule_owner"),objectId:z.string().uuid(),workerId:z.string().uuid(),scheduleOwner:z.enum(["manager","worker"]).nullable()}),
 z.object({action:z.literal("review_plan"),objectId:z.string().uuid(),workerId:z.string().uuid(),date:z.string().date(),approve:z.boolean()}),
 z.object({action:z.literal("set_worker_pattern"),objectId:z.string().uuid(),workerId:z.string().uuid(),effectiveFrom:z.string().date(),workDays:z.number().int().min(1).max(30),restDays:z.number().int().min(0).max(30),shiftKind:z.enum(["day","night"]),floatingDaysOff:z.boolean()}),
 z.object({action:z.literal("review_pattern"),objectId:z.string().uuid(),workerId:z.string().uuid(),date:z.string().date(),approve:z.boolean()})
]);
export async function GET(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const url=new URL(request.url);
  const objectId=url.searchParams.get("objectId")??undefined;
  const [portal,details,planning]=await Promise.all([managerPortalData(actor,objectId,url.searchParams.get("workerId")??undefined),employeeDetailManagerList(actor,objectId),managerEmployeePlanningChanges(actor,objectId)]);
  return NextResponse.json({...portal,...details,...planning});
 }catch(error){console.error("worker confirmations GET",error);return NextResponse.json({error:"Не удалось загрузить подтверждения. Проверьте миграцию базы данных."},{status:500})}
}
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const body=actions.parse(await request.json());
  const result=body.action==="set_worker_pattern"
   ?await managerSetWorkerPattern(actor,body.objectId,body.workerId,{effectiveFrom:body.effectiveFrom,workDays:body.workDays,restDays:body.restDays,shiftKind:body.shiftKind,floatingDaysOff:body.floatingDaysOff})
   :body.action==="review_pattern"
   ?await managerReviewPattern(actor,body.objectId,body.workerId,body.date,body.approve)
   :body.action==="worker_schedule_owner"
   ?await managerSetScheduleOwner(actor,body.objectId,body.scheduleOwner,body.workerId)
   :body.action==="review_plan"
   ?await managerReviewEmployeePlan(actor,body.objectId,body.workerId,body.date,body.approve)
   :body.action==="manager_phone"||body.action==="verify_document"||body.action==="review_shift_time"||body.action==="document_requirement"
   ?await managerEmployeeDetailAction(actor,body as Parameters<typeof managerEmployeeDetailAction>[1])
   :body.action==="reconcile"
   ?await reconcileEmployeeHours(actor,body.objectId,body.fromDate,body.toDate)
   :body.action==="settings"
   ?await managerSetScheduleOwner(actor,body.objectId,body.scheduleOwner,undefined,body.horizon)
   :await editWorkerLink(actor,body.objectId,body.workerId,body.action);
  return NextResponse.json(result);
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные"},{status:400});
  if(error instanceof Error&&error.message.includes("Forbidden"))return NextResponse.json({error:"Недостаточно прав"},{status:403});
  return NextResponse.json({error:error instanceof Error?error.message:"Ошибка сохранения"},{status:400});
 }
}
