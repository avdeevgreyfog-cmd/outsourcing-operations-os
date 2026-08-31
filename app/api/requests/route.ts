import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const provider=z.enum(["client","us","not_required"]);
const provisionItem=z.object({provider,amount:z.number().nonnegative().optional(),unit:z.string().max(40).optional(),comment:z.string().max(500).optional()});
const role=z.object({
  specialtyId:z.string().uuid(),count:z.number().int().positive().max(5000),qualification:z.string().trim().max(200).optional(),experience:z.string().trim().max(500).optional(),
  salaryTarget:z.number().nonnegative().optional(),salaryUnit:z.string().trim().max(40).optional(),scheduleType:z.enum(["5/2","6/1","2/2","watch","other"]).optional(),
  startsAt:z.string().regex(/^\d{2}:\d{2}$/).optional(),endsAt:z.string().regex(/^\d{2}:\d{2}$/).optional(),presenceHours:z.number().nonnegative().max(24).optional(),paidHours:z.number().nonnegative().max(24).optional(),
  lunchMinutes:z.number().int().nonnegative().max(300).optional(),lunchPaid:z.boolean().optional(),nightHours:z.number().nonnegative().max(24).optional(),overtimeRule:z.string().trim().max(500).optional(),requirements:z.record(z.string(),z.json()).default({})
});
const schema=z.object({
  clientId:z.string().uuid().optional(),title:z.string().trim().min(2).max(240),customerInn:z.string().trim().max(20).optional(),contactName:z.string().trim().max(200).optional(),contactPosition:z.string().trim().max(160).optional(),contactPhone:z.string().trim().max(80).optional(),contactEmail:z.string().email().max(240).optional(),sourceKind:z.string().trim().max(80).optional(),
  siteName:z.string().trim().max(240).optional(),location:z.string().trim().max(300).optional(),city:z.string().trim().max(120).optional(),regionId:z.string().uuid().optional(),transportAccess:z.string().trim().max(500).optional(),nearestTransport:z.string().trim().max(200).optional(),logisticsComment:z.string().trim().max(1000).optional(),
  startDate:z.string().date().optional(),durationText:z.string().trim().max(120).optional(),projectIndefinite:z.boolean().default(false),schedule:z.record(z.string(),z.json()).default({}),
  staffingRequirements:z.record(z.string(),z.json()).default({}),provision:z.record(z.string(),provisionItem).default({}),commercialLimits:z.object({desiredClientRate:z.number().nonnegative().optional(),maxClientRate:z.number().nonnegative().optional(),vatMode:z.enum(["with_vat","without_vat"]).optional(),employeeSalaryOffer:z.number().nonnegative().optional(),totalBudget:z.number().nonnegative().optional(),monthlyLimit:z.number().nonnegative().optional(),other:z.string().max(1000).optional()}).default({}),
  nextAction:z.string().trim().max(500).optional(),nextActionAt:z.string().datetime().optional(),roles:z.array(role).max(40).default([])
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.request.create");if(actor.demo)return NextResponse.json({error:"Демо-данные доступны только для чтения. Подключите PostgreSQL для сохранения изменений."},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const requestNumber=`З-${new Date().toISOString().slice(2,7).replace('-','')}-${crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`;
      const [r]=await tx<Array<{id:string;requestNumber:string;title:string;stage:string}>>`
        INSERT INTO requests (organization_id,client_company_id,request_number,title,status,stage,outcome,location_text,region_id,expected_start_date,duration_text,project_indefinite,schedule_json,vat_mode,owner_user_id,created_by_user_id,assigned_team_id,source_kind,customer_inn,contact_name,contact_position,contact_phone,contact_email,site_name,city,transport_access,nearest_transport,logistics_comment,staffing_requirements_json,provision_json,commercial_limits_json,next_action_text,next_action_at)
        VALUES (${actor.organizationId}::uuid,${body.clientId??null}::uuid,${requestNumber},${body.title},'new','new','open',${body.location??null},${body.regionId??null}::uuid,${body.startDate??null}::date,${body.durationText??null},${body.projectIndefinite},${sql.json(body.schedule)},${body.commercialLimits.vatMode??null},${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid,${body.sourceKind??'manager'},${body.customerInn??null},${body.contactName??null},${body.contactPosition??null},${body.contactPhone??null},${body.contactEmail??null},${body.siteName??null},${body.city??null},${body.transportAccess??null},${body.nearestTransport??null},${body.logisticsComment??null},${sql.json(body.staffingRequirements)},${sql.json(body.provision)},${sql.json(body.commercialLimits)},${body.nextAction??null},${body.nextActionAt??null}::timestamptz)
        RETURNING id,request_number "requestNumber",title,stage`;
      for(const rr of body.roles)await tx`INSERT INTO request_roles (organization_id,request_id,specialty_id,count_required,requirements_json,qualification,experience_text,salary_target,salary_unit,schedule_type,starts_at,ends_at,presence_hours,paid_hours,lunch_minutes,lunch_paid,night_hours,overtime_rule) VALUES (${actor.organizationId}::uuid,${r.id}::uuid,${rr.specialtyId}::uuid,${rr.count},${sql.json(rr.requirements)},${rr.qualification??null},${rr.experience??null},${rr.salaryTarget??null},${rr.salaryUnit??null},${rr.scheduleType??null},${rr.startsAt??null}::time,${rr.endsAt??null}::time,${rr.presenceHours??null},${rr.paidHours??null},${rr.lunchMinutes??null},${rr.lunchPaid??null},${rr.nightHours??null},${rr.overtimeRule??null})`;
      return r;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Ошибка проверки данных",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});
  }
}
