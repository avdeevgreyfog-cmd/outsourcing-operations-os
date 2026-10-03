import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const updateSchema=z.object({
  action:z.literal("update"),
  name:z.string().trim().min(2).max(180),
  code:z.string().trim().max(80).nullable().optional(),
  category:z.enum(["workwear","ppe","tool","equipment","consumable","other"]),
  unit:z.string().trim().min(1).max(30),
  returnable:z.boolean(),
  tracksVariant:z.boolean(),
  sizeMode:z.enum(["none","clothing","shoe","manual"]),
  defaultReplacementCycleDays:z.number().int().min(1).max(3650).nullable().optional(),
  notes:z.string().trim().max(1500).nullable().optional(),
});
const variantSchema=z.object({
  action:z.literal("add_variant"),
  label:z.string().trim().min(1).max(80),
  code:z.string().trim().max(80).nullable().optional(),
  sortOrder:z.number().int().min(0).max(100000).optional(),
});
const priceSchema=z.object({
  action:z.literal("add_price"),
  unitCost:z.number().min(0),
  effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  variantId:z.string().uuid().nullable().optional(),
  source:z.enum(["manual","purchase","supplier","opening"]).default("manual"),
  partnerId:z.string().uuid().nullable().optional(),
  notes:z.string().trim().max(1500).nullable().optional(),
});
const schema=z.discriminatedUnion("action",[updateSchema,variantSchema,priceSchema]);

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [item]=await tx<Array<{id:string}>>`SELECT id FROM inventory_items WHERE id=${id}::uuid AND active FOR UPDATE`;
      if(!item)throw new Error("Товар не найден");
      if(body.action==="update"){
        await tx`
          UPDATE inventory_items SET
            name=${body.name},code=${body.code??null},category=${body.category},unit=${body.unit},
            returnable=${body.returnable},tracks_variant=${body.tracksVariant},size_mode=${body.sizeMode},
            default_replacement_cycle_days=${body.defaultReplacementCycleDays??null},notes=${body.notes??null},updated_at=now()
          WHERE id=${id}::uuid
        `;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'inventory_item',${id}::uuid,'updated',${"Обновлена номенклатурная позиция: "+body.name},'{}'::jsonb)`;
        return {ok:true};
      }
      if(body.action==="add_variant"){
        const [variant]=await tx<Array<{id:string}>>`
          INSERT INTO inventory_item_variants(organization_id,item_id,code,label,sort_order,active,created_by_user_id,updated_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.code??null},${body.label},${body.sortOrder??0},true,${actor.userId}::uuid,${actor.userId}::uuid)
          ON CONFLICT (item_id,label) DO UPDATE SET code=EXCLUDED.code,sort_order=EXCLUDED.sort_order,active=true,updated_by_user_id=${actor.userId}::uuid,updated_at=now()
          RETURNING id
        `;
        return {ok:true,id:variant.id};
      }
      if(body.variantId){
        const [variant]=await tx<Array<{id:string}>>`SELECT id FROM inventory_item_variants WHERE id=${body.variantId}::uuid AND item_id=${id}::uuid AND active`;
        if(!variant)throw new Error("Размер или вариант не относится к товару");
      }
      if(body.partnerId){
        const [partner]=await tx<Array<{id:string}>>`SELECT id FROM supply_partners WHERE id=${body.partnerId}::uuid AND status<>'archived'`;
        if(!partner)throw new Error("Поставщик не найден");
      }
      const [nextPrice]=await tx<Array<{effectiveFrom:string}>>`
        SELECT effective_from::text "effectiveFrom" FROM inventory_item_prices
        WHERE item_id=${id}::uuid
          AND variant_id IS NOT DISTINCT FROM ${body.variantId??null}::uuid
          AND effective_from>${body.effectiveFrom}::date
        ORDER BY effective_from ASC,created_at ASC LIMIT 1
      `;
      await tx`
        UPDATE inventory_item_prices
        SET effective_to=(${body.effectiveFrom}::date-1)
        WHERE item_id=${id}::uuid
          AND variant_id IS NOT DISTINCT FROM ${body.variantId??null}::uuid
          AND effective_from<${body.effectiveFrom}::date
          AND (effective_to IS NULL OR effective_to>=${body.effectiveFrom}::date)
      `;
      const [price]=await tx<Array<{id:string}>>`
        INSERT INTO inventory_item_prices(organization_id,item_id,variant_id,unit_cost,effective_from,effective_to,source,partner_id,notes,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.variantId??null}::uuid,${body.unitCost},${body.effectiveFrom}::date,
          ${nextPrice?.effectiveFrom??null}::date - CASE WHEN ${nextPrice?.effectiveFrom??null}::date IS NULL THEN 0 ELSE 1 END,
          ${body.source},${body.partnerId??null}::uuid,${body.notes??null},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'inventory_item',${id}::uuid,'price_added','Добавлена стоимость номенклатурной позиции',${tx.json({priceId:price.id,unitCost:body.unitCost,effectiveFrom:body.effectiveFrom,variantId:body.variantId??null})})`;
      return {ok:true,id:price.id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные товара",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить товар"},{status:500});
  }
}
