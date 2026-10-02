import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const createSchema=z.object({
  siteId:z.string().uuid(),
  partnerId:z.string().uuid().nullable().optional(),
  contractNumber:z.string().trim().max(120).nullable().optional(),
  signedOn:z.string().date().nullable().optional(),
  validFrom:z.string().date(),
  validTo:z.string().date().nullable().optional(),
  billingModel:z.enum(["bed_day","bed_month","room_day","room_month","site_period"]),
  bookedCapacity:z.number().int().min(0).nullable().optional(),
  rateAmount:z.number().min(0),
  depositAmount:z.number().min(0).nullable().optional(),
  paymentDay:z.number().int().min(1).max(31).nullable().optional(),
  prepaidUntil:z.string().date().nullable().optional(),
  nextPaymentDue:z.string().date().nullable().optional(),
  noticeDays:z.number().int().min(0).nullable().optional(),
  autoRenew:z.boolean().default(false),
  notes:z.string().trim().max(1500).nullable().optional(),
});
const paymentSchema=z.object({
  action:z.literal("record_payment"),
  id:z.string().uuid(),
  amount:z.number().positive(),
  paymentDate:z.string().date(),
  prepaidUntil:z.string().date().nullable().optional(),
  nextPaymentDue:z.string().date().nullable().optional(),
  reference:z.string().trim().max(240).nullable().optional(),
  objectId:z.string().uuid().nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({ok:true},{status:201});
    const body=createSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [site]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT hs.id,hs.primary_object_id "objectId",COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds"
        FROM housing_sites hs LEFT JOIN objects o ON o.id=hs.primary_object_id WHERE hs.id=${body.siteId}::uuid
      `;
      if(!site||!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,...site,objectId:site.objectId??undefined,regionId:site.regionId??undefined},actor))throw new AccessDeniedError("supply.housing.manage");
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO housing_contracts(organization_id,site_id,partner_id,contract_number,signed_on,valid_from,valid_to,billing_model,booked_capacity,rate_amount,deposit_amount,payment_day,prepaid_until,next_payment_due,notice_days,auto_renew,notes,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.siteId}::uuid,${body.partnerId??null}::uuid,${body.contractNumber??null},${body.signedOn??null}::date,${body.validFrom}::date,${body.validTo??null}::date,${body.billingModel},${body.bookedCapacity??null},${body.rateAmount},${body.depositAmount??null},${body.paymentDay??null},${body.prepaidUntil??null}::date,${body.nextPaymentDue??null}::date,${body.noticeDays??null},${body.autoRenew},${body.notes??null},${actor.userId}::uuid)
        RETURNING id
      `;
      if(body.partnerId)await tx`UPDATE housing_sites SET partner_id=${body.partnerId}::uuid,updated_at=now() WHERE id=${body.siteId}::uuid`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_contract',${row.id}::uuid,'created',${"Добавлен договор жилья"+(body.contractNumber?" № "+body.contractNumber:"")},${tx.json({siteId:body.siteId,contractId:row.id,bookedCapacity:body.bookedCapacity??null})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте договор жилья",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать договор"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=paymentSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];partnerId:string|null;partner:string|null;contractNumber:string|null;site:string}>>`
        SELECT hc.id,hs.primary_object_id "objectId",COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds",
          hc.partner_id "partnerId",sp.name partner,hc.contract_number "contractNumber",hs.name site
        FROM housing_contracts hc JOIN housing_sites hs ON hs.id=hc.site_id
        LEFT JOIN objects o ON o.id=hs.primary_object_id LEFT JOIN supply_partners sp ON sp.id=hc.partner_id
        WHERE hc.id=${body.id}::uuid FOR UPDATE OF hc
      `;
      if(!row||!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,...row,objectId:row.objectId??undefined,regionId:row.regionId??undefined},actor))throw new AccessDeniedError("supply.housing.manage");
      const expenseObjectId=body.objectId??row.objectId;
      if(!expenseObjectId)throw new Error("Для фиксации расхода выберите объект");
      const [linked]=await tx<Array<{id:string}>>`
        SELECT id FROM housing_site_objects
        WHERE site_id=(SELECT site_id FROM housing_contracts WHERE id=${row.id}::uuid)
          AND object_id=${expenseObjectId}::uuid AND active
      `;
      if(!linked)throw new Error("Выбранный объект не связан с этим жильём");
      const [expense]=await tx<Array<{id:string}>>`
        INSERT INTO object_expenses(organization_id,object_id,expense_date,category,amount,vendor,reference,plan_fact,housing_contract_id,supply_partner_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${expenseObjectId}::uuid,${body.paymentDate}::date,'housing',${body.amount},${row.partner??null},${body.reference??(row.contractNumber?"Договор "+row.contractNumber:row.site)},'fact',${row.id}::uuid,${row.partnerId??null}::uuid,${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        UPDATE housing_contracts SET prepaid_until=COALESCE(${body.prepaidUntil??null}::date,prepaid_until),
          next_payment_due=COALESCE(${body.nextPaymentDue??null}::date,next_payment_due),updated_by_user_id=${actor.userId}::uuid,updated_at=now()
        WHERE id=${row.id}::uuid
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_contract',${row.id}::uuid,'payment_recorded',${"Зафиксирована оплата жилья: "+body.amount+" ₽"},${tx.json({siteId:(await tx<Array<{siteId:string}>>`SELECT site_id "siteId" FROM housing_contracts WHERE id=${row.id}::uuid`)[0]?.siteId,contractId:row.id,expenseId:expense.id,objectId:expenseObjectId,amount:body.amount})})
      `;
      return {id:row.id,expenseId:expense.id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте оплату",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось зафиксировать оплату"},{status:500});
  }
}
