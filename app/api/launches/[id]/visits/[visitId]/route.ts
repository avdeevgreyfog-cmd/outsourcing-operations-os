import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const checklistItem=z.object({
  id:z.string().min(1),
  section:z.string().min(1),
  label:z.string().min(1),
  required:z.boolean(),
  status:z.enum(["pending","confirmed","issue","na"]),
  value:z.string(),
  note:z.string(),
  category:z.string().min(1),
  blocksLaunch:z.boolean(),
});
const schema=z.object({
  scheduledDate:z.string().date().nullable().optional(),
  status:z.enum(["planned","in_progress","completed","cancelled"]).optional(),
  checklist:z.array(checklistItem).optional(),
  notes:z.string().max(5000).nullable().optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;visitId:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо чек-лист изменяется только локально"},{status:409});
    const {id,visitId}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[];targetDate:string;checklist:unknown}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
          l.target_date::text "targetDate",v.checklist_json checklist
        FROM launch_site_visits v JOIN launches l ON l.id=v.launch_id JOIN objects o ON o.id=l.object_id
        WHERE v.id=${visitId}::uuid AND l.id=${id}::uuid
        FOR UPDATE
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      const checklist=body.checklist??(Array.isArray(scope.checklist)?scope.checklist:[]);
      const completed=body.status==="completed";
      await tx`
        UPDATE launch_site_visits SET
          scheduled_date=CASE WHEN ${body.scheduledDate===undefined} THEN scheduled_date ELSE ${body.scheduledDate??null}::date END,
          status=COALESCE(${body.status??null},status),
          checklist_json=${tx.json(checklist)},
          notes=CASE WHEN ${body.notes===undefined} THEN notes ELSE ${body.notes??null} END,
          completed_at=CASE WHEN ${completed} THEN now() ELSE completed_at END,
          updated_at=now()
        WHERE id=${visitId}::uuid AND launch_id=${id}::uuid
      `;
      if(completed){
        const items=checklist.filter((item:any)=>item&&typeof item==="object"&&(item.status==="issue"||(item.required&&item.status==="pending")));
        for(const item of items){
          const prefix=item.status==="issue"?"Решить":"Уточнить";
          const title=`${prefix}: ${String(item.label)}`.slice(0,240);
          const [existing]=await tx<Array<{id:string}>>`
            SELECT id FROM launch_tasks WHERE launch_id=${id}::uuid AND title=${title} AND status NOT IN ('done','cancelled') LIMIT 1
          `;
          if(existing)continue;
          await tx`
            INSERT INTO launch_tasks(organization_id,launch_id,title,owner_user_id,start_date,end_date,baseline_start,baseline_end,progress_pct,status,risk_level,is_milestone,is_critical,category,task_kind,blocks_launch,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${id}::uuid,${title},${scope.ownerUserId}::uuid,current_date,GREATEST(current_date,${scope.targetDate}::date-1),current_date,GREATEST(current_date,${scope.targetDate}::date-1),0,'planned',${item.blocksLaunch?"high":"watch"},false,${Boolean(item.blocksLaunch)},${String(item.category||"operations")},'task',${Boolean(item.blocksLaunch)},${actor.userId}::uuid)
          `;
        }
      }
      return {id:visitId,status:body.status??null};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте чек-лист",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить выезд"},{status:500});
  }
}
