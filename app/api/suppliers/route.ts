import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const category=z.enum(["housing","transport","workwear_ppe","tools_equipment","medicine","travel_tickets","food","services","other"]);
const schema=z.object({
  name:z.string().trim().min(2).max(240),
  legalName:z.string().trim().max(320).nullable().optional(),
  taxId:z.string().trim().max(32).nullable().optional(),
  categories:z.array(category).min(1),
  contactName:z.string().trim().max(180).nullable().optional(),
  phone:z.string().trim().max(80).nullable().optional(),
  email:z.string().trim().email().max(240).nullable().optional(),
  address:z.string().trim().max(500).nullable().optional(),
  paymentTerms:z.string().trim().max(500).nullable().optional(),
  notes:z.string().trim().max(1500).nullable().optional(),
});
const serviceSchema=z.object({
  partnerId:z.string().uuid(),
  category,
  serviceName:z.string().trim().min(2).max(240),
  unit:z.string().trim().max(80).nullable().optional(),
  price:z.number().min(0).nullable().optional(),
  notes:z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supplier.manage");if(actor.demo)return NextResponse.json({ok:true},{status:201});
    const body=schema.parse(await request.json());
    const [row]=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{id:string}>>`
      INSERT INTO supply_partners(organization_id,name,legal_name,tax_id,categories,contact_name,phone,email,address_text,payment_terms,notes,owner_user_id,created_by_user_id)
      VALUES(${actor.organizationId}::uuid,${body.name},${body.legalName??null},${body.taxId??null},${body.categories}::text[],${body.contactName??null},${body.phone??null},${body.email??null},${body.address??null},${body.paymentTerms??null},${body.notes??null},${actor.userId}::uuid,${actor.userId}::uuid)
      RETURNING id
    `);
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные организации",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать организацию"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supplier.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=serviceSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [partner]=await sql<Array<{id:string}>>`SELECT id FROM supply_partners WHERE id=${body.partnerId}::uuid`;
      if(!partner)throw new Error("Организация не найдена");
      const [service]=await sql<Array<{id:string}>>`
        INSERT INTO supply_partner_services(organization_id,partner_id,category,service_name,unit,price,notes,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.partnerId}::uuid,${body.category},${body.serviceName},${body.unit??null},${body.price??null},${body.notes??null},${actor.userId}::uuid)
        RETURNING id
      `;
      return service;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте услугу",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось добавить услугу"},{status:500});
  }
}
