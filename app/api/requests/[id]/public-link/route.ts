import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({mode:z.enum(["create","complete"]).default("complete"),expiresAt:z.string().datetime().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"sales.request.public_link.manage");if(actor.demo)return NextResponse.json({error:"Демо-данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());const token=randomBytes(32).toString("base64url");const tokenHash=createHash("sha256").update(token).digest("hex");
    await withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<Array<{id:string}>>`SELECT id FROM requests WHERE id=${id}::uuid`;if(!rows.length)throw new Error("REQUEST_NOT_FOUND");await sql`INSERT INTO request_public_links(organization_id,request_id,mode,token_hash,expires_at,created_by_user_id) VALUES (${actor.organizationId}::uuid,${id}::uuid,${body.mode},${tokenHash},${body.expiresAt??null}::timestamptz,${actor.userId}::uuid)`;});
    const origin=new URL(request.url).origin;return NextResponse.json({url:`${origin}/public/request/${token}`,token});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Ошибка проверки данных"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof Error&&error.message==="REQUEST_NOT_FOUND")return NextResponse.json({error:"Заявка не найдена"},{status:404});console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});}
}
