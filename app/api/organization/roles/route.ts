import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const createSchema=z.object({name:z.string().trim().min(2).max(160),code:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),description:z.string().trim().max(2000).optional(),responsibility:z.string().trim().max(2000).optional()});
const updateSchema=createSchema.partial().extend({id:z.string().uuid(),active:z.boolean().optional()});
async function currentActor(){const value=await getCurrentActor();if(!value)throw new Error("UNAUTHORIZED");requireCapability(value,"organization.position.manage");if(value.demo)throw new Error("DEMO");return value}

export async function POST(request:Request){
  try{
    const actor=await currentActor();const body=createSchema.parse(await request.json());
    const [row]=await withTenant(actor.organizationId,actor.userId,sql=>sql.unsafe<Array<{id:string}>>(
      "INSERT INTO process_roles(organization_id,code,name,description,responsibility) VALUES($1::uuid,$2,$3,$4,$5) RETURNING id",
      [actor.organizationId,body.code,body.name,body.description??null,body.responsibility??null]
    ));
    return NextResponse.json({ok:true,id:row.id},{status:201});
  }catch(error){return fail(error,"Не удалось создать роль")}
}

export async function PATCH(request:Request){
  try{
    const actor=await currentActor();const body=updateSchema.parse(await request.json());
    const rows=await withTenant(actor.organizationId,actor.userId,sql=>sql.unsafe<Array<{id:string}>>(
      "UPDATE process_roles SET code=COALESCE($2,code),name=COALESCE($3,name),description=COALESCE($4,description),responsibility=COALESCE($5,responsibility),active=COALESCE($6,active),updated_at=now() WHERE id=$1::uuid RETURNING id",
      [body.id,body.code??null,body.name??null,body.description??null,body.responsibility??null,body.active??null]
    ));if(!rows.length)throw new Error("NOT_FOUND");
    return NextResponse.json({ok:true});
  }catch(error){return fail(error,"Не удалось изменить роль")}
}

function fail(error:unknown,message:string){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполнение полей",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Требуется вход в систему"},{status:401});if(error instanceof Error&&error.message==="DEMO")return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Процессная роль не найдена"},{status:404});console.error(error);return NextResponse.json({error:message},{status:500})}
