import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const role=z.object({
  specialtyId:z.string().uuid(),
  count:z.number().int().positive().max(5000),
  schedule:z.record(z.string(),z.json()).default({}),
  requirements:z.record(z.string(),z.json()).default({}),
  targetClientRate:z.number().nonnegative().nullable().optional(),
});
const schema=z.object({
  clientId:z.string().uuid().nullable().optional(),
  title:z.string().trim().min(3).max(240),
  source:z.string().trim().min(1).max(80).default("manual"),
  location:z.string().trim().min(2).max(300),
  regionId:z.string().uuid(),
  startDate:z.string().date().optional(),
  durationText:z.string().trim().max(120).optional(),
  schedule:z.record(z.string(),z.json()).default({}),
  lunchPaid:z.boolean().default(false),
  vatMode:z.string().trim().max(40).default("with_vat"),
  housingRule:z.string().trim().max(120).optional(),
  travelRule:z.string().trim().max(120).optional(),
  shuttleRule:z.string().trim().max(120).optional(),
  ppeRule:z.string().trim().max(120).optional(),
  medicalRule:z.string().trim().max(120).optional(),
  citizenshipRule:z.string().trim().max(120).optional(),
  toolsRule:z.string().trim().max(120).optional(),
  comments:z.string().trim().max(3000).optional(),
  roles:z.array(role).min(1).max(40),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.request.create");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      if(body.clientId){
        const [client]=await tx<Array<{id:string}>>`SELECT id FROM client_companies WHERE id=${body.clientId}::uuid`;
        if(!client)throw new Error("Клиент не найден в текущей организации");
      }
      const [r]=await tx<Array<{id:string;title:string;status:string}>>`
        INSERT INTO requests (
          organization_id,client_company_id,title,status,source,location_text,region_id,expected_start_date,duration_text,schedule_json,lunch_paid,
          vat_mode,housing_rule,travel_rule,shuttle_rule,ppe_rule,medical_rule,citizenship_rule,tools_rule,comments,
          owner_user_id,created_by_user_id,assigned_team_id
        ) VALUES (
          ${actor.organizationId}::uuid,${body.clientId??null}::uuid,${body.title},'draft',${body.source},${body.location},${body.regionId}::uuid,
          ${body.startDate??null}::date,${body.durationText??null},${sql.json(body.schedule)},${body.lunchPaid},${body.vatMode},
          ${body.housingRule??null},${body.travelRule??null},${body.shuttleRule??null},${body.ppeRule??null},${body.medicalRule??null},
          ${body.citizenshipRule??null},${body.toolsRule??null},${body.comments??null},${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid
        ) RETURNING id,title,status
      `;
      for(const rr of body.roles)await tx`
        INSERT INTO request_roles (organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json,target_client_rate)
        VALUES (${actor.organizationId}::uuid,${r.id}::uuid,${rr.specialtyId}::uuid,${rr.count},${sql.json(rr.schedule)},${sql.json(rr.requirements)},${rr.targetClientRate??null})
      `;
      return r;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполнение полей",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
