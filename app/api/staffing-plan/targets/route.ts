import {getOperationsReferenceData} from "@/lib/operations/service";
import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {listStaffingPlan,setStaffingPlanTarget,staffingPlanWithConditionsSchema} from "@/lib/operations/staffing-plan";
import {listObjectConditions} from "@/lib/operations/object-conditions";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getRecruitingOptions} from "@/lib/recruiting/service";
import {withTenant} from "@/lib/db/client";
function fail(error:unknown){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message??"Проверьте поля",issues:error.issues},{status:400});return NextResponse.json({error:error instanceof Error?error.message:"Ошибка плана"},{status:409})}
type LinkedNeed={id:string;organizationId:string;objectId:string;regionId:string|null;ownerUserId:string|null;managerUserId:string|null;createdByUserId:string|null;assigneeUserIds:string[];targetId:string|null;specialtyId:string;shiftKind:string;countRequired:number;countFilled:number;status:string;priority:string;deadline:string|null};
export async function GET(request:Request){
 try{
  const actor=await getCurrentActor();
  if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
  const objectId=z.string().uuid().parse(new URL(request.url).searchParams.get("objectId"));
  const canEditNeed=hasCapability(actor.access,"operations.need.edit");
  const [rows,conditions,specialties,linkedNeeds,recruitingOptions]=await Promise.all([
   listStaffingPlan(actor,objectId),
   listObjectConditions(actor,objectId),
   actor.demo?getOperationsReferenceData(actor,"operations.need.read",{includeWorkers:false}).then(r=>r.specialties):withTenant(actor.organizationId,actor.userId,sql=>sql`SELECT id,name FROM specialties WHERE organization_id=${actor.organizationId}::uuid AND active ORDER BY name`),
   actor.demo?Promise.resolve([] as LinkedNeed[]):withTenant(actor.organizationId,actor.userId,sql=>sql<LinkedNeed[]>`
    SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",n.region_id "regionId",
      n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.created_by_user_id "createdByUserId",
      n.staffing_plan_target_id "targetId",n.specialty_id "specialtyId",n.shift_kind "shiftKind",n.count_required "countRequired",n.count_filled "countFilled",
      n.status,n.priority,n.deadline::text deadline,
      ARRAY(SELECT a.recruiter_user_id::text FROM need_assignments a WHERE a.need_id=n.id AND a.unassigned_at IS NULL AND a.recruiter_user_id IS NOT NULL) "assigneeUserIds"
    FROM needs n WHERE n.organization_id=${actor.organizationId}::uuid
      AND n.object_id=${objectId}::uuid
      AND n.status IN('open','in_progress','paused') ORDER BY n.created_at DESC`),
   canEditNeed?getRecruitingOptions(actor).then(options=>options.recruiters):Promise.resolve([]),
  ]);
  return NextResponse.json({rows,conditions,specialties,
    linkedNeeds:linkedNeeds.filter(row=>canReadRow(actor.access,"operations.need.read",row,actor)),
    recruiters:recruitingOptions,demo:actor.demo,
    canManageDirectories:hasCapability(actor.access,"admin.permissions.manage"),
    canCreateNeed:hasCapability(actor.access,"operations.need.create"),
    canEditNeed,
  });
 }catch(e){return fail(e)}
}
export async function POST(request:Request){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});const raw=await request.json();const input=staffingPlanWithConditionsSchema.parse({plan:raw,initialCondition:raw.initialCondition});return NextResponse.json(await setStaffingPlanTarget(actor,input.plan,input.initialCondition))}catch(e){return fail(e)}}
export const PATCH=POST;
