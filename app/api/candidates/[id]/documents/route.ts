import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  applicationId:z.string().uuid(),
  items:z.array(z.object({
    documentName:z.string().trim().min(1).max(160),
    status:z.enum(["missing","requested","received","verified","not_required"]),
    required:z.boolean().default(true),
    note:z.string().trim().max(500).nullable().optional(),
    sortOrder:z.number().int().min(0).max(1000).default(0),
  })).max(50),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демо чек-лист сохраняется только в текущем браузере"},{status:409});
    const {id}=await params;
    const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;regionId:string|null;objectId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT ca.id,ca.organization_id "organizationId",ca.responsible_user_id "ownerUserId",
          COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text,ca.responsible_user_id::text]
            || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM candidate_applications ca
        JOIN needs n ON n.id=ca.need_id
        LEFT JOIN objects o ON o.id=ca.object_id
        WHERE ca.id=${body.applicationId}::uuid AND ca.candidate_id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      for(const item of body.items){
        await tx`
          INSERT INTO candidate_application_documents(
            organization_id,application_id,document_name,status,required,note,sort_order,updated_by_user_id
          ) VALUES(
            ${actor.organizationId}::uuid,${body.applicationId}::uuid,${item.documentName},${item.status},${item.required},
            ${item.note??null},${item.sortOrder},${actor.userId}::uuid
          )
          ON CONFLICT (application_id,document_name)
          DO UPDATE SET status=EXCLUDED.status,required=EXCLUDED.required,note=EXCLUDED.note,
            sort_order=EXCLUDED.sort_order,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
        `;
      }
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте список документов",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:"Не удалось обновить документы"},{status:500});
  }
}
