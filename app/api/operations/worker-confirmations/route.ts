import {NextResponse} from "next/server";
import {AccessDeniedError} from "@/lib/access/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {managerPortalData,editWorkerLink,savePortalConfiguration,reviewEmployeeHours,reconcileEmployeeHours,EmployeePortalError} from "@/lib/operations/worker-timesheet-portal";
import {employeeDetailManagerList,managerEmployeeDetailAction} from "@/lib/operations/employee-self-service";
import {managerSetScheduleOwner,managerEmployeePlanningChanges,managerReviewEmployeePlan,managerSetWorkerPattern,managerReviewPattern} from "@/lib/operations/employee-planning";
const portalConfigSchema=z.object({
 managerName:z.string().max(120).nullable().optional(),managerPhone:z.string().max(50).nullable().optional(),
 contactMethod:z.string().max(120).nullable().optional(),instruction:z.string().max(2000).optional(),
 timezone:z.string().max(80).optional(),showWorkInstruction:z.boolean().optional(),validDays:z.number().int().min(1).max(365).optional(),
 autoRevokeOnExit:z.boolean().optional(),sections:z.object({
  shifts:z.boolean().optional(),confirm:z.boolean().optional(),decline:z.boolean().optional(),scheduleChanges:z.boolean().optional(),
  hours:z.boolean().optional(),timesheet:z.boolean().optional(),documents:z.boolean().optional(),employment:z.boolean().optional(),
  workwear:z.boolean().optional(),contacts:z.boolean().optional(),objectInfo:z.boolean().optional(),payAdjustments:z.boolean().optional(),suggestDaysOff:z.boolean().optional()
 }).strict().optional()
}).strict();
const actions=z.discriminatedUnion("action",[
 z.object({action:z.enum(["create","rotate","copy","pause","resume","revoke"]),objectId:z.string().uuid(),workerId:z.string().uuid(),
 config:portalConfigSchema.optional(),expiresAt:z.string().datetime({offset:true}).optional(),autoRevokeAt:z.string().datetime({offset:true}).optional()}),
 z.object({action:z.literal("save_portal_configuration"),scope:z.enum(["organization","object","worker"]),scopeId:z.string().uuid(),objectId:z.string().uuid().optional(),config:portalConfigSchema}),
 z.object({action:z.literal("review_hours"),objectId:z.string().uuid(),workerId:z.string().uuid(),date:z.string().date(),approve:z.boolean(),
 approvedHours:z.number().positive().max(24).optional(),comment:z.string().max(500).optional()}),
 z.object({action:z.literal("settings"),objectId:z.string().uuid(),scheduleOwner:z.enum(["manager","worker"]),horizon:z.number().int().min(2).max(31).optional()}),
 z.object({action:z.literal("reconcile"),objectId:z.string().uuid(),fromDate:z.string().date(),toDate:z.string().date()}),
 z.object({action:z.literal("portal_sections"),objectId:z.string().uuid(),documents:z.boolean(),workwear:z.boolean()}),
 z.object({action:z.literal("manager_phone"),objectId:z.string().uuid(),phone:z.string().max(50).nullable()}),
 z.object({action:z.literal("verify_document"),objectId:z.string().uuid(),workerId:z.string().uuid(),code:z.string().max(40),verified:z.boolean()}),
 z.object({action:z.literal("review_sizes"),objectId:z.string().uuid(),workerId:z.string().uuid(),requestId:z.string().uuid(),approve:z.boolean()}),
 z.object({action:z.literal("set_onboarding"),objectId:z.string().uuid(),workerId:z.string().uuid(),stage:z.enum(["not_started","requested","partial","review","completed","correction"]),comment:z.string().trim().max(1200).nullable(),showAfterCompleted:z.boolean()}),
 z.object({action:z.literal("set_document_status"),objectId:z.string().uuid(),workerId:z.string().uuid(),code:z.string().max(40),status:z.enum(["not_requested","awaiting","received","accepted","resubmit"])}),
 z.object({action:z.literal("resolve_hours_dispute"),objectId:z.string().uuid(),workerId:z.string().uuid(),disputeId:z.string().uuid(),status:z.enum(["in_review","resolved","rejected"])}),
 z.object({action:z.literal("upsert_adjustment"),objectId:z.string().uuid(),workerId:z.string().uuid(),periodStart:z.string().date(),periodEnd:z.string().date(),amount:z.number().nonnegative().max(1e9),adjustmentType:z.enum(["deduction","damage","advance","other"]),reason:z.string().trim().min(1).max(1200),description:z.string().trim().min(1).max(1200),status:z.enum(["draft","review","confirmed","cancelled"])}),
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
 }catch(error){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error("worker confirmations GET",error);return NextResponse.json({error:"Не удалось загрузить подтверждения. Проверьте миграцию базы данных."},{status:500})}
}
export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const body=actions.parse(await request.json());
  const result=body.action==="save_portal_configuration"
    ?await savePortalConfiguration(actor,body.scope,body.scopeId,body.config,body.objectId)
    :body.action==="review_hours"
    ?await reviewEmployeeHours(actor,body.objectId,body.workerId,body.date,body.approve,body.approvedHours,body.comment)
    :body.action==="set_worker_pattern"
   ?await managerSetWorkerPattern(actor,body.objectId,body.workerId,{effectiveFrom:body.effectiveFrom,workDays:body.workDays,restDays:body.restDays,shiftKind:body.shiftKind,floatingDaysOff:body.floatingDaysOff})
   :body.action==="review_pattern"
   ?await managerReviewPattern(actor,body.objectId,body.workerId,body.date,body.approve)
   :body.action==="worker_schedule_owner"
   ?await managerSetScheduleOwner(actor,body.objectId,body.scheduleOwner,body.workerId)
   :body.action==="review_plan"
   ?await managerReviewEmployeePlan(actor,body.objectId,body.workerId,body.date,body.approve)
   :body.action==="portal_sections"||body.action==="manager_phone"||body.action==="verify_document"||body.action==="review_shift_time"||body.action==="document_requirement"||body.action==="review_sizes"||body.action==="set_onboarding"||body.action==="set_document_status"||body.action==="resolve_hours_dispute"||body.action==="upsert_adjustment"
   ?await managerEmployeeDetailAction(actor,body as Parameters<typeof managerEmployeeDetailAction>[1])
   :body.action==="reconcile"
   ?await reconcileEmployeeHours(actor,body.objectId,body.fromDate,body.toDate)
   :body.action==="settings"
   ?await managerSetScheduleOwner(actor,body.objectId,body.scheduleOwner,undefined,body.horizon)
   :await editWorkerLink(actor,body.objectId,body.workerId,body.action,body.config,body.expiresAt,body.autoRevokeAt);
  return NextResponse.json(result);
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные"},{status:400});
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
  if(!(error instanceof EmployeePortalError)){
    const diagnostic=error as {name?:string;code?:string}|null;
    // Never log the request payload, raw employee token, credentials, or SQL parameters.
    console.error("worker confirmations POST failed",{errorType:diagnostic?.name??"unknown",databaseCode:diagnostic?.code??null});
  }
  return NextResponse.json({error:error instanceof EmployeePortalError?error.message:"Не удалось выполнить действие. Попробуйте позже"},{status:error instanceof EmployeePortalError?400:500});
 }
}
