import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(300),category:z.string().trim().min(2).max(100),legalEntityId:z.string().uuid().nullable().optional(),documentNumber:z.string().trim().max(160).nullable().optional(),sourceUrl:z.string().url().max(2000).nullable().optional(),status:z.enum(["active","needs_update","missing","archived"]).default("active"),validFrom:z.string().date().nullable().optional(),expiresAt:z.string().date().nullable().optional(),notes:z.string().trim().max(3000).nullable().optional()});

export async function POST(request:Request){
  try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"company.document.manage");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});const body=schema.parse(await request.json());
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>{if(body.legalEntityId){const [entity]=await sql`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid`;if(!entity)throw new Error("Юридическое лицо не найдено");}const [created]=await sql<Array<{id:string}>>`INSERT INTO company_documents(organization_id,legal_entity_id,name,category,document_number,source_url,status,valid_from,expires_at,notes,created_by_user_id,updated_by_user_id) VALUES(${actor.organizationId}::uuid,${body.legalEntityId??null}::uuid,${body.name},${body.category},${body.documentNumber??null},${body.sourceUrl??null},${body.status},${body.validFrom??null}::date,${body.expiresAt??null}::date,${body.notes??null},${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;return created;});return NextResponse.json(row,{status:201});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте документ",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});}
}
