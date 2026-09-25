import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(300),category:z.enum(["client_instruction","access","ppe","safety","act","template","client","other"]).default("other"),documentNumber:z.string().trim().max(160).nullable().optional(),sourceUrl:z.string().url().max(2000).nullable().optional(),status:z.enum(["active","needs_update","archived"]).default("active"),validFrom:z.string().date().nullable().optional(),expiresAt:z.string().date().nullable().optional(),notes:z.string().trim().max(3000).nullable().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"operations.object.edit");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const created=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds" FROM objects o WHERE o.id=${id}::uuid`;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      const [row]=await tx<Array<{id:string}>>`INSERT INTO object_documents(organization_id,object_id,name,category,document_number,source_url,status,valid_from,expires_at,notes,created_by_user_id,updated_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.name},${body.category},${body.documentNumber??null},${body.sourceUrl??null},${body.status},${body.validFrom??null}::date,${body.expiresAt??null}::date,${body.notes??null},${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'document_created',${`Добавлен документ объекта: ${body.name}`},${tx.json({documentId:row.id,category:body.category})})`;
      return row;
    }));
    return NextResponse.json(created,{status:201});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте документ",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить документ"},{status:500});}
}