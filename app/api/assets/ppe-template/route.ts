import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  specialtyId:z.string().uuid(),
  items:z.array(z.object({
    itemId:z.string().uuid(),
    quantity:z.number().positive().max(1000),
    sizeSource:z.enum(["none","clothing","shoe","manual"]).default("none"),
    variant:z.string().trim().max(120).default(""),
    replacementCycleDays:z.number().int().min(1).max(3650).nullable().optional(),
  })).max(100),
});

export async function PUT(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");
    const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [specialty]=await tx<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE id=${body.specialtyId}::uuid AND active`;
      if(!specialty)throw new Error("Специальность не найдена");
      const itemIds=[...new Set(body.items.map(item=>item.itemId))];
      if(itemIds.length){
        const valid=await tx<Array<{id:string}>>`SELECT id FROM inventory_items WHERE id=ANY(${itemIds}::uuid[]) AND active AND category<>'consumable'`;
        if(valid.length!==itemIds.length)throw new Error("В норме есть недоступная позиция");
      }
      let [template]=await tx<Array<{id:string}>>`SELECT id FROM object_ppe_templates WHERE object_id IS NULL AND specialty_id=${body.specialtyId}::uuid AND active FOR UPDATE`;
      if(!template){
        [template]=await tx<Array<{id:string}>>`
          INSERT INTO object_ppe_templates(organization_id,object_id,specialty_id,name,created_by_user_id,updated_by_user_id)
          VALUES(${actor.organizationId}::uuid,NULL,${body.specialtyId}::uuid,${"Базовая норма: "+specialty.name},${actor.userId}::uuid,${actor.userId}::uuid)
          RETURNING id
        `;
      }
      await tx`DELETE FROM object_ppe_template_items WHERE template_id=${template.id}::uuid`;
      for(const item of body.items)await tx`
        INSERT INTO object_ppe_template_items(organization_id,template_id,item_id,quantity,size_source,variant,replacement_cycle_days)
        VALUES(${actor.organizationId}::uuid,${template.id}::uuid,${item.itemId}::uuid,${item.quantity},${item.sizeSource},${item.variant},${item.replacementCycleDays??null})
      `;
      await tx`UPDATE object_ppe_templates SET updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${template.id}::uuid`;
      return {ok:true,id:template.id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте базовую норму",issues:error.issues},{status:400});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить базовую норму"},{status:500});
  }
}
