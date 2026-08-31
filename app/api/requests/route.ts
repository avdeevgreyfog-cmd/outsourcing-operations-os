import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const nullableMoney=z.number().nonnegative().nullable().optional();
const role=z.object({
 specialtyId:z.string().uuid().nullable().optional(),specialtyName:z.string().trim().max(160).optional(),count:z.number().int().positive().max(5000).default(1),
 qualification:z.string().trim().max(500).optional(),experience:z.string().trim().max(500).optional(),salaryTarget:nullableMoney,scheduleType:z.string().trim().max(80).optional(),
 shiftStart:z.string().trim().max(10).optional(),shiftEnd:z.string().trim().max(10).optional(),presenceHours:nullableMoney,paidHours:nullableMoney,lunchMinutes:z.number().int().nonnegative().max(600).nullable().optional(),lunchPaid:z.boolean().default(false),requirements:z.string().trim().max(3000).optional(),
}).refine(value=>Boolean(value.specialtyId||value.specialtyName),{message:"Укажите специальность"});
const provision=z.object({code:z.string().trim().min(1).max(80),provider:z.enum(["client","ours","not_required"]),amount:nullableMoney,unit:z.string().trim().max(80).optional(),comment:z.string().trim().max(1000).optional()});
const schema=z.object({
 clientId:z.string().uuid().nullable().optional(),title:z.string().trim().max(240).optional().default(""),companyName:z.string().trim().max(240).optional(),inn:z.string().trim().max(32).optional(),contactName:z.string().trim().max(200).optional(),contactPosition:z.string().trim().max(160).optional(),phone:z.string().trim().max(80).optional(),email:z.string().trim().max(240).optional(),source:z.string().trim().max(160).optional(),
 siteName:z.string().trim().max(240).optional(),address:z.string().trim().max(500).optional(),city:z.string().trim().max(160).optional(),regionId:z.string().uuid().nullable().optional(),transportAccess:z.string().trim().max(500).optional(),nearestTransport:z.string().trim().max(240).optional(),logisticsComment:z.string().trim().max(2000).optional(),
 startDate:z.string().date().nullable().optional(),durationText:z.string().trim().max(160).optional(),desiredClientRate:nullableMoney,maxClientRate:nullableMoney,clientRateVatMode:z.enum(["with_vat","without_vat"]).default("with_vat"),proposedWorkerPay:nullableMoney,totalBudget:nullableMoney,monthlyLimit:nullableMoney,
 nextAction:z.string().trim().max(500).optional(),nextActionAt:z.string().datetime().nullable().optional(),roles:z.array(role).max(40).default([]),provisions:z.array(provision).max(30).default([]),
});

export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"sales.request.create");
  if(actor.demo)return NextResponse.json({error:"Демонстрационный набор данных доступен только для чтения."},{status:409});
  const body=schema.parse(await request.json());
  const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
   let clientName:string|null=null;if(body.clientId){const [client]=await tx<Array<{name:string}>>`SELECT name FROM client_companies WHERE id=${body.clientId}::uuid`;if(!client)throw new Error("CLIENT_NOT_FOUND");clientName=client.name;}
   const generatedTitle=body.title||body.siteName||body.companyName||clientName||`Новая заявка ${new Date().toLocaleDateString("ru-RU")}`;
   const housing=body.provisions.find(item=>item.code==="housing");
   const [created]=await tx<Array<{id:string;number:string;title:string;stage:string}>>`
    INSERT INTO requests(
     organization_id,client_company_id,title,status,commercial_stage,business_result,company_name_text,inn_text,contact_name,contact_position,contact_phone,contact_email,source,
     site_name,location_text,address_text,city,region_id,transport_access,nearest_transport,logistics_comment,expected_start_date,duration_text,vat_mode,housing_rule,
     desired_client_rate,max_client_rate,client_rate_vat_mode,proposed_worker_pay,total_budget,monthly_limit,next_action,next_action_at,owner_user_id,created_by_user_id,assigned_team_id
    ) VALUES (
     ${actor.organizationId}::uuid,${body.clientId??null}::uuid,${generatedTitle},'draft','new','open',${body.companyName||null},${body.inn||null},${body.contactName||null},${body.contactPosition||null},${body.phone||null},${body.email||null},${body.source||null},
     ${body.siteName||null},${body.address||body.city||body.siteName||null},${body.address||null},${body.city||null},${body.regionId??null}::uuid,${body.transportAccess||null},${body.nearestTransport||null},${body.logisticsComment||null},${body.startDate??null}::date,${body.durationText||null},${body.clientRateVatMode},${housing?.provider??null},
     ${body.desiredClientRate??null},${body.maxClientRate??null},${body.clientRateVatMode},${body.proposedWorkerPay??null},${body.totalBudget??null},${body.monthlyLimit??null},${body.nextAction||null},${body.nextActionAt??null}::timestamptz,${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid
    ) RETURNING id,request_number number,title,commercial_stage stage`;
   for(const item of body.roles)await tx`
    INSERT INTO request_roles(organization_id,request_id,specialty_id,specialty_name,count_required,qualification,experience_text,salary_target,schedule_type,shift_start,shift_end,presence_hours,paid_hours,lunch_minutes,lunch_paid,requirements_json)
    VALUES(${actor.organizationId}::uuid,${created.id}::uuid,${item.specialtyId??null}::uuid,${item.specialtyName||null},${item.count},${item.qualification||null},${item.experience||null},${item.salaryTarget??null},${item.scheduleType||null},${item.shiftStart||null}::time,${item.shiftEnd||null}::time,${item.presenceHours??null},${item.paidHours??null},${item.lunchMinutes??null},${item.lunchPaid},${sql.json({notes:item.requirements||null})})`;
   for(const item of body.provisions)await tx`
    INSERT INTO request_provisions(organization_id,request_id,code,provider,amount,unit,comment,created_by_user_id)
    VALUES(${actor.organizationId}::uuid,${created.id}::uuid,${item.code},${item.provider},${item.amount??null},${item.unit||null},${item.comment||null},${actor.userId}::uuid)`;
   await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${created.id}::uuid,'request.created',${`Создана заявка ${created.number}`},${sql.json({source:body.source||"internal",clientId:body.clientId??null})})`;
   return created;
  }));
  return NextResponse.json(result,{status:201});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполненные поля",issues:error.issues},{status:400});
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Forbidden"},{status:403});
  if(error instanceof Error&&error.message==="CLIENT_NOT_FOUND")return NextResponse.json({error:"Клиент не найден"},{status:400});
  console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});
 }
}
