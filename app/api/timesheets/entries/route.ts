import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({workerId:z.string().uuid(),objectId:z.string().uuid(),workDate:z.string().date(),value:z.union([z.string().max(20),z.number().min(0).max(24),z.null()]),nightHours:z.number().min(0).max(24).optional(),overtimeHours:z.number().min(0).max(24).optional(),reason:z.string().trim().max(500).nullable().optional(),segment:z.enum(["day","night"]).optional()});
const codeMap:Record<string,string>={"П":"PLANNED","?":"WORK_PENDING","В":"DAY_OFF","О":"VACATION","ОТ":"VACATION","МВ":"INTERSHIFT","Б":"SICK","НВ":"NO_SHOW","Н":"ABSENCE"};

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"time.time_entry.edit");if(actor.demo)return NextResponse.json({error:"Демо: рабочие часы не сохраняются"},{status:409});
    const body=schema.parse(await request.json());
    const raw=body.value==null?"":String(body.value).trim().toUpperCase();
    let timeCode="WORK",factHours=0;
    if(raw===""){
      timeCode="NOT_SPECIFIED";factHours=0;
    }else if(codeMap[raw]){
      timeCode=codeMap[raw];factHours=0;
    }else{
      const parsed=Number(raw.replace(",","."));
      if(!Number.isFinite(parsed)||parsed<0||parsed>24)return NextResponse.json({error:"Введите часы 0–24 или код: П, ?, В, О, МВ, Б, НВ"},{status:400});
      factHours=parsed;
    }
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid AND o.organization_id=${actor.organizationId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"time.time_entry.edit",object,actor))throw new AccessDeniedError("time.time_entry.edit");
      await tx`SELECT id FROM worker_profiles WHERE id=${body.workerId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`;
      const [locked]=await tx<Array<{status:string;viewType:string}>>`
        SELECT status,"viewType" FROM (
          SELECT DISTINCT ON(view_type) view_type "viewType",status
          FROM timesheet_snapshots
          WHERE object_id=${body.objectId}::uuid AND period_start<=${body.workDate}::date AND period_end>=${body.workDate}::date
          ORDER BY view_type,COALESCE(version,1) DESC,created_at DESC
        ) latest
        WHERE status IN ('fixed','internal_submitted','internal_checked','client_sent','client_approved','closed')
        LIMIT 1
      `;
      if(locked)throw new Error("Табель за эту дату уже зафиксирован в маршруте согласования. Верните период на корректировку перед изменением факта.");
      const [assignment]=await tx<Array<{id:string}>>`
        SELECT id FROM worker_object_assignments
        WHERE organization_id=${actor.organizationId}::uuid AND worker_id=${body.workerId}::uuid AND object_id=${body.objectId}::uuid
          AND (effective_from IS NULL OR effective_from<=${body.workDate}::date) AND (effective_to IS NULL OR effective_to>=${body.workDate}::date)
        LIMIT 1
      `;
      if(!assignment)throw new Error("На эту дату сотрудник не назначен на объект");
      const [existing]=await tx<Array<{id:string;timeCode:string;factHours:number|string;dayHours:number|string;nightHours:number|string;plannedShiftKind:"day"|"night"|"mixed"|null}>>`
        SELECT id,time_code "timeCode",fact_hours "factHours",day_hours "dayHours",night_hours "nightHours",planned_shift_kind "plannedShiftKind" FROM time_entries
        WHERE organization_id=${actor.organizationId}::uuid AND worker_id=${body.workerId}::uuid AND object_id=${body.objectId}::uuid AND work_date=${body.workDate}::date
        ORDER BY (shift_id IS NULL) DESC,updated_at DESC LIMIT 1 FOR UPDATE
      `;
      if(!existing&&raw==="")return;
      const numeric=timeCode==="WORK"&&raw!=="";const existingDay=Number(existing?.dayHours??0),existingNight=Number(existing?.nightHours??0);
      const nextDay=numeric?(body.segment==="night"?existingDay:factHours):0;
      const nextNight=numeric?(body.segment==="night"?factHours:(body.segment==="day"?existingNight:Number(body.nightHours??0))):0;
      const nextFact=numeric?nextDay+nextNight:0;const plannedKind=body.segment??existing?.plannedShiftKind??null;
      if(nextFact>24)throw new Error("Дневные и ночные часы в сумме не могут превышать 24");
      const [clock]=await tx`SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM object_shift_reporting_settings WHERE object_id=${body.objectId}::uuid AND organization_id=${actor.organizationId}::uuid),'Europe/Moscow'))::date::text today`;
      if(nextFact>0&&body.workDate>clock.today)throw new Error("Нельзя вносить будущие фактические часы");
      if(existing&&existing.timeCode===timeCode&&Number(existing.factHours)===nextFact&&existingDay===nextDay&&existingNight===nextNight&&!body.reason)return;
      if(existing){
        await tx`
          UPDATE time_entries SET planned=${timeCode!=="DAY_OFF"},time_code=${timeCode},fact_hours=${nextFact},day_hours=${nextDay},
            night_hours=${nextNight},overtime_hours=${body.overtimeHours??0},planned_shift_kind=COALESCE(${plannedKind},planned_shift_kind),source='manual',
            correction_reason=${body.reason??"Ручная корректировка табеля"},corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
          WHERE id=${existing.id}::uuid
        `;
      }else{
        await tx`
          INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,planned_shift_kind,source,correction_reason,corrected_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.workerId}::uuid,${body.objectId}::uuid,${body.workDate}::date,${timeCode!=="DAY_OFF"},${timeCode},${nextFact},${nextDay},${nextNight},${body.overtimeHours??0},${plannedKind},'manual',${body.reason??"Ручной ввод табеля"},${actor.userId}::uuid)
        `;
      }
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте запись табеля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить табель"},{status:500});
  }
}
export async function GET(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
  requireCapability(actor,"time.timesheet.read");
  const query=z.object({objectId:z.string().uuid(),month:z.string().regex(/^\d{4}-\d{2}$/)}).parse(Object.fromEntries(new URL(request.url).searchParams));
  if(actor.demo)return NextResponse.json({entries:[],history:[],demo:true});
  const result=await withTenant(actor.organizationId,actor.userId,async sql=>{
   const [object]=await sql`SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",ARRAY(SELECT a.user_id::text FROM object_assignments a WHERE a.object_id=o.id AND a.organization_id=o.organization_id AND a.effective_from<=current_date AND(a.effective_to IS NULL OR a.effective_to>=current_date)) "assigneeUserIds" FROM objects o WHERE o.id=${query.objectId}::uuid AND o.organization_id=${actor.organizationId}::uuid`;
   if(!object||!canReadRow(actor.access,"time.timesheet.read",object,actor))throw new AccessDeniedError("time.timesheet.read");
   const entries=await sql`SELECT t.id,w.full_name worker,t.work_date::text "workDate",CASE WHEN t.time_code='NOT_SPECIFIED' THEN NULL ELSE t.fact_hours::float8 END hours,t.source,t.time_code "timeCode",u.display_name actor,t.updated_at "updatedAt",t.correction_reason reason FROM time_entries t JOIN worker_profiles w ON w.id=t.worker_id AND w.organization_id=t.organization_id LEFT JOIN app_users u ON u.id=t.corrected_by_user_id WHERE t.organization_id=${actor.organizationId}::uuid AND t.object_id=${query.objectId}::uuid AND t.work_date>=${query.month+'-01'}::date AND t.work_date<${query.month+'-01'}::date+interval '1 month' ORDER BY t.work_date,w.full_name`;
   const history=await sql`SELECT a.id,a.created_at "createdAt",a.action,u.display_name actor,COALESCE(a.after_json->>'work_date',a.before_json->>'work_date') "workDate",COALESCE(w.full_name,'Сотрудник') worker,a.before_json->>'fact_hours' "beforeHours",a.after_json->>'fact_hours' "afterHours",COALESCE(a.after_json->>'correction_reason',a.reason) reason FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_user_id LEFT JOIN worker_profiles w ON w.id=COALESCE(a.after_json->>'worker_id',a.before_json->>'worker_id')::uuid AND w.organization_id=a.organization_id WHERE a.organization_id=${actor.organizationId}::uuid AND a.resource_type='time_entries' AND COALESCE(a.after_json->>'object_id',a.before_json->>'object_id')=${query.objectId} AND COALESCE(a.after_json->>'work_date',a.before_json->>'work_date')>=${query.month+'-01'} AND COALESCE(a.after_json->>'work_date',a.before_json->>'work_date')<to_char(${query.month+'-01'}::date+interval '1 month','YYYY-MM-DD') ORDER BY a.created_at DESC LIMIT 500`;
   return {entries,history};
  });return NextResponse.json(result);
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте объект и период"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Не удалось загрузить историю табеля"},{status:500})}
}
