import {getOperationsReferenceData} from "@/lib/operations/service";
import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {listStaffingPlan,setStaffingPlanTarget,staffingPlanWithConditionsSchema} from "@/lib/operations/staffing-plan";
import {listObjectConditions} from "@/lib/operations/object-conditions";
import {hasCapability} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
function fail(error:unknown){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message??"Проверьте поля",issues:error.issues},{status:400});return NextResponse.json({error:error instanceof Error?error.message:"Ошибка плана"},{status:409})}
export async function GET(request:Request){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});const objectId=z.string().uuid().parse(new URL(request.url).searchParams.get('objectId'));const [rows,conditions,specialties]=await Promise.all([listStaffingPlan(actor,objectId),listObjectConditions(actor,objectId),actor.demo?getOperationsReferenceData(actor,"operations.need.read",{includeWorkers:false}).then(r=>r.specialties):withTenant(actor.organizationId,actor.userId,sql=>sql`SELECT id,name FROM specialties WHERE organization_id=${actor.organizationId}::uuid AND active ORDER BY name`)]);return NextResponse.json({rows,conditions,specialties,demo:actor.demo,canManageDirectories:hasCapability(actor.access,"admin.permissions.manage"),canCreateNeed:hasCapability(actor.access,"operations.need.create")})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});const raw=await request.json();const input=staffingPlanWithConditionsSchema.parse({plan:raw,initialCondition:raw.initialCondition});return NextResponse.json(await setStaffingPlanTarget(actor,input.plan,input.initialCondition))}catch(e){return fail(e)}}
export const PATCH=POST;
