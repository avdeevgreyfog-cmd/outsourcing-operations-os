import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(300),category:z.string().trim().min(2).max(100),legalEntityId:z.string().uuid().nullable().optional(),documentNumber:z.string().trim().max(160).nullable().optional(),sourceUrl:z.string().url().max(2000).nullable().optional(),status:z.enum(["active","needs_update","missing","archived"]),validFrom:z.string().date().nullable().optional(),expiresAt:z.string().date().nullable().optional(),notes:z.string().trim().max(3000).nullable().optional()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"company.document.manage");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});const {id}=await params;const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>{const [exists]=await sql`SELECT id FROM company_documents WHERE id=${id}::uuid`;if(!exists)throw new Error("Документ не найден");if(body.legalEntityId){const [entity]=await sql`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid`;if(!entity)throw new Error("Юридическое лицо не найдено");}await sql`UPDATE company_documents SET legal_entity_id=${body.legalEntityId??null}::uuid,name=${body.name},category=${body.category},document_number=${body.documentNumber??null},source_url=${body.sourceUrl??null},status=${body.status},valid_from=${body.validFrom??null}::date,expires_at=${body.expiresAt??null}::date,notes=${body.notes??null},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;});return NextResponse.json({ok:true});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте документ",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});}
}
