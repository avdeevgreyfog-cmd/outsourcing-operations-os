import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import type { Sql } from "postgres";

const schema=z.object({
  itemId:z.string().uuid(),
  variant:z.string().trim().max(80).default(""),
  movementType:z.enum(["opening","receipt","transfer","issue","return","writeoff","adjustment_in","adjustment_out"]),
  quantity:z.number().positive(),
  fromLocationId:z.string().uuid().nullable().optional(),
  toLocationId:z.string().uuid().nullable().optional(),
  workerId:z.string().uuid().nullable().optional(),
  condition:z.enum(["new","good","worn","damaged","unusable"]).nullable().optional(),
  note:z.string().trim().max(1500).nullable().optional(),
  unitCost:z.number().min(0).nullable().optional(),
  writeoffAfterReturn:z.boolean().optional(),
});

async function locationBalance(tx:Sql,itemId:string,variant:string,locationId:string){
  const [row]=await tx<Array<{quantity:number}>>`
    WITH deltas AS (
      SELECT quantity delta FROM inventory_movements WHERE item_id=${itemId}::uuid AND variant=${variant} AND to_location_id=${locationId}::uuid AND movement_type IN ('opening','receipt','transfer','return','adjustment_in')
      UNION ALL
      SELECT -quantity delta FROM inventory_movements WHERE item_id=${itemId}::uuid AND variant=${variant} AND from_location_id=${locationId}::uuid AND movement_type IN ('transfer','issue','writeoff','adjustment_out')
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
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      if(body.fromLocationId&&["transfer","issue","writeoff","adjustment_out"].includes(type)){
        const balance=await locationBalance(tx,body.itemId,body.variant,body.fromLocationId);
        if(balance<body.quantity)throw new Error(`Недостаточный остаток: доступно ${balance}`);
      }
      if(body.workerId&&["return","writeoff"].includes(type)&&!body.fromLocationId){
        const outstanding=await workerOutstanding(tx,body.itemId,body.variant,body.workerId);
        if(outstanding<body.quantity)throw new Error(`У сотрудника учтено только ${outstanding}`);
      }
      await tx`
        INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,from_location_id,to_location_id,worker_id,item_condition,unit_cost,note,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.itemId}::uuid,${body.variant},${type},${body.quantity},${body.fromLocationId??null}::uuid,${body.toLocationId??null}::uuid,${body.workerId??null}::uuid,${body.condition??null},${body.unitCost??null},${body.note??null},${actor.userId}::uuid)
      `;
      if(type==="return"&&body.writeoffAfterReturn){
        await tx`
          INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,from_location_id,item_condition,note,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.itemId}::uuid,${body.variant},'writeoff',${body.quantity},${body.toLocationId}::uuid,${body.condition??"unusable"},${body.note?body.note+" · Списание после возврата":"Списание после возврата"},${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'inventory','movement',${`Движение имущества: ${type}`},${tx.json({itemId:body.itemId,variant:body.variant,quantity:body.quantity,fromLocationId:body.fromLocationId??null,toLocationId:body.toLocationId??null,workerId:body.workerId??null,writeoffAfterReturn:Boolean(body.writeoffAfterReturn)})})
      `;
    }));
    return NextResponse.json({ok:true},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте движение имущества",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить движение"},{status:500});
  }
}
