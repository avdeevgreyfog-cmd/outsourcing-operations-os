import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({specialtyId:z.string().uuid(),items:z.array(z.object({itemId:z.string().uuid(),quantity:z.number().positive().max(100),sizeSource:z.enum(["none","clothing","shoe","manual"]).default("none"),variant:z.string().trim().max(120).default("")})).max(100)});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${id}::uuid
      `;
      if(!object||!canReadRow(actor.access,"assets.manage",object,actor))throw new AccessDeniedError("assets.manage");
      const [specialty]=await tx<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE id=${body.specialtyId}::uuid AND active`;
      if(!specialty)throw new Error("Специальность не найдена");
      const itemIds=[...new Set(body.items.map(item=>item.itemId))];
      if(itemIds.length){const valid=await tx<Array<{id:string}>>`SELECT id FROM inventory_items WHERE id=ANY(${itemIds}::uuid[]) AND active AND category IN ('workwear','ppe')`;if(valid.length!==itemIds.length)throw new Error("В шаблоне есть недоступная позиция");}
      let [template]=await tx<Array<{id:string}>>`SELECT id FROM object_ppe_templates WHERE object_id=${id}::uuid AND specialty_id=${body.specialtyId}::uuid AND active FOR UPDATE`;
      if(!template){[template]=await tx<Array<{id:string}>>`INSERT INTO object_ppe_templates(organization_id,object_id,specialty_id,name,created_by_user_id,updated_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.specialtyId}::uuid,${`Комплект: ${specialty.name}`},${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;}
      await tx`DELETE FROM object_ppe_template_items WHERE template_id=${template.id}::uuid`;
      for(const item of body.items){await tx`INSERT INTO object_ppe_template_items(organization_id,template_id,item_id,quantity,size_source,variant) VALUES(${actor.organizationId}::uuid,${template.id}::uuid,${item.itemId}::uuid,${item.quantity},${item.sizeSource},${item.variant})`;}
      await tx`UPDATE object_ppe_templates SET updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${template.id}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'ppe_template_updated',${`Обновлён комплект СИЗ: ${specialty.name}`},${tx.json({templateId:template.id,specialtyId:body.specialtyId,itemCount:body.items.length})})`;
      return {ok:true,id:template.id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте шаблон комплекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить комплект"},{status:500});
  }
}