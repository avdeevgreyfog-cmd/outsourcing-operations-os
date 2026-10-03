import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";
import type { Sql } from "postgres";

const condition=z.enum(["new","good","worn","damaged","unusable"]);
const schema=z.object({
  itemId:z.string().uuid(),
  variant:z.string().trim().max(80).default(""),
  variantId:z.string().uuid().nullable().optional(),
  movementType:z.enum(["opening","receipt","transfer","issue","return","writeoff","adjustment_in","adjustment_out","recondition"]),
  quantity:z.number().positive(),
  fromLocationId:z.string().uuid().nullable().optional(),
  toLocationId:z.string().uuid().nullable().optional(),
  workerId:z.string().uuid().nullable().optional(),
  sourceCondition:condition.nullable().optional(),
  targetCondition:condition.nullable().optional(),
  condition:condition.nullable().optional(),
  note:z.string().trim().max(1500).nullable().optional(),
  unitCost:z.number().min(0).nullable().optional(),
  writeoffAfterReturn:z.boolean().optional(),
});

function inboundTypes(type:string){return ["opening","receipt","transfer","return","adjustment_in","recondition"].includes(type)}
function outboundTypes(type:string){return ["transfer","issue","writeoff","adjustment_out","recondition"].includes(type)}

async function locationConditionBalance(tx:Sql,itemId:string,variant:string,locationId:string,conditionValue:string){
  const [row]=await tx<Array<{quantity:number}>>`
    WITH deltas AS (
      SELECT quantity delta
      FROM inventory_movements
      WHERE item_id=${itemId}::uuid AND variant=${variant} AND to_location_id=${locationId}::uuid
        AND movement_type IN ('opening','receipt','transfer','return','adjustment_in','recondition')
        AND COALESCE(target_condition,item_condition,CASE WHEN movement_type IN ('opening','receipt') THEN 'new' ELSE 'good' END)=${conditionValue}
      UNION ALL
      SELECT -quantity delta
      FROM inventory_movements
      WHERE item_id=${itemId}::uuid AND variant=${variant} AND from_location_id=${locationId}::uuid
        AND movement_type IN ('transfer','issue','writeoff','adjustment_out','recondition')
        AND COALESCE(source_condition,item_condition,'good')=${conditionValue}
    ) SELECT COALESCE(sum(delta),0)::numeric quantity FROM deltas
  `;return Number(row?.quantity??0);
}
async function workerOutstanding(tx:Sql,itemId:string,variant:string,workerId:string){
  const [row]=await tx<Array<{quantity:number}>>`
    SELECT COALESCE(
      sum(CASE WHEN movement_type='issue' THEN quantity WHEN movement_type='return' THEN -quantity WHEN movement_type='writeoff' AND from_location_id IS NULL THEN -quantity ELSE 0 END),0
    )::numeric quantity
    FROM inventory_movements WHERE item_id=${itemId}::uuid AND variant=${variant} AND worker_id=${workerId}::uuid
  `;return Number(row?.quantity??0);
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=schema.parse(await request.json());
    const type=body.movementType;
    if(["opening","receipt","adjustment_in"].includes(type)&&!body.toLocationId)return NextResponse.json({error:"Укажите место поступления"},{status:400});
    if(["issue","adjustment_out"].includes(type)&&!body.fromLocationId)return NextResponse.json({error:"Укажите место списания"},{status:400});
    if(type==="transfer"&&(!body.fromLocationId||!body.toLocationId))return NextResponse.json({error:"Укажите откуда и куда перемещать"},{status:400});
    if(["issue","return"].includes(type)&&!body.workerId)return NextResponse.json({error:"Укажите сотрудника"},{status:400});
    if(type==="return"&&!body.toLocationId)return NextResponse.json({error:"Укажите место возврата"},{status:400});
    if(type==="writeoff"&&!body.fromLocationId&&!body.workerId)return NextResponse.json({error:"Укажите место хранения или сотрудника"},{status:400});
    if(type==="recondition"&&(!body.fromLocationId||!body.toLocationId||body.fromLocationId!==body.toLocationId))return NextResponse.json({error:"Изменение состояния выполняется внутри одного места хранения"},{status:400});

    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let variant=body.variant;
      let variantId=body.variantId??null;
      if(variantId){
        const [variantRow]=await tx<Array<{id:string;label:string}>>`
          SELECT id,label FROM inventory_item_variants WHERE id=${variantId}::uuid AND item_id=${body.itemId}::uuid AND active
        `;
        if(!variantRow)throw new Error("Размер или вариант не относится к товару");
        variant=variantRow.label;
      }

      const locationIds=[body.fromLocationId,body.toLocationId].filter((value):value is string=>Boolean(value));
      if(locationIds.length){
        const locations=await tx<Array<{id:string;organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT l.id,l.organization_id "organizationId",l.object_id "objectId",
            COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa
              WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
              || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds"
          FROM storage_locations l LEFT JOIN objects o ON o.id=l.object_id
          WHERE l.id=ANY(${locationIds}::uuid[]) AND l.active
        `;
        if(locations.length!==new Set(locationIds).size||locations.some(row=>!canReadRow(actor.access,"assets.manage",{...row,objectId:row.objectId??undefined,ownerUserId:row.ownerUserId??undefined,regionId:row.regionId??undefined},actor)))throw new AccessDeniedError("assets.manage");
      }
      if(body.workerId){
        const [worker]=await tx<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT w.organization_id "organizationId",a.object_id "objectId",COALESCE(a.manager_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa
              WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM worker_profiles w
          LEFT JOIN LATERAL (
            SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id
            ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
          ) a ON true
          LEFT JOIN objects o ON o.id=a.object_id
          WHERE w.id=${body.workerId}::uuid
        `;
        if(!worker||!canReadRow(actor.access,"assets.manage",{...worker,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined},actor))throw new AccessDeniedError("assets.manage");
      }

      const sourceCondition=outboundTypes(type)?(body.sourceCondition??body.condition??"good"):null;
      const targetCondition=inboundTypes(type)?(
        body.targetCondition??body.condition??(type==="opening"||type==="receipt"?"new":type==="transfer"?sourceCondition??"good":"good")
      ):null;
      if(type==="recondition"&&sourceCondition===targetCondition)throw new Error("Укажите новое состояние вещи");

      if(body.fromLocationId&&outboundTypes(type)){
        const balance=await locationConditionBalance(tx,body.itemId,variant,body.fromLocationId,sourceCondition??"good");
        if(balance<body.quantity)throw new Error(`Недостаточный остаток в выбранном состоянии: доступно ${balance}`);
      }
      if(body.workerId&&["return","writeoff"].includes(type)&&!body.fromLocationId){
        const outstanding=await workerOutstanding(tx,body.itemId,variant,body.workerId);
        if(outstanding<body.quantity)throw new Error(`У сотрудника учтено только ${outstanding}`);
      }

      const compatibilityCondition=targetCondition??sourceCondition??body.condition??null;
      await tx`
        INSERT INTO inventory_movements(
          organization_id,item_id,variant,variant_id,movement_type,quantity,from_location_id,to_location_id,worker_id,
          item_condition,source_condition,target_condition,unit_cost,note,created_by_user_id
        )
        VALUES(
          ${actor.organizationId}::uuid,${body.itemId}::uuid,${variant},${variantId}::uuid,${type},${body.quantity},
          ${body.fromLocationId??null}::uuid,${body.toLocationId??null}::uuid,${body.workerId??null}::uuid,
          ${compatibilityCondition},${sourceCondition},${targetCondition},${body.unitCost??null},${body.note??null},${actor.userId}::uuid
        )
      `;
      if(type==="return"&&body.writeoffAfterReturn){
        await tx`
          INSERT INTO inventory_movements(
            organization_id,item_id,variant,variant_id,movement_type,quantity,from_location_id,item_condition,source_condition,note,created_by_user_id
          )
          VALUES(
            ${actor.organizationId}::uuid,${body.itemId}::uuid,${variant},${variantId}::uuid,'writeoff',${body.quantity},
            ${body.toLocationId!}::uuid,${targetCondition??"unusable"},${targetCondition??"unusable"},
            ${body.note?body.note+" · Списание после возврата":"Списание после возврата"},${actor.userId}::uuid
          )
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'inventory','movement',${"Движение имущества: "+type},
          ${tx.json({itemId:body.itemId,variant,variantId,quantity:body.quantity,fromLocationId:body.fromLocationId??null,toLocationId:body.toLocationId??null,workerId:body.workerId??null,sourceCondition,targetCondition,writeoffAfterReturn:Boolean(body.writeoffAfterReturn)})})
      `;
    }));
    return NextResponse.json({ok:true},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте движение имущества",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить движение"},{status:500});
  }
}
