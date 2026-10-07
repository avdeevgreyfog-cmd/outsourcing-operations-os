import {NextResponse} from "next/server";
import {z} from "zod";
import type {Sql} from "postgres";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const channel=z.enum(["phone","email","telegram","whatsapp","max"]);
const schema=z.object({
  fullName:z.string().trim().min(2).max(180),
  position:z.string().trim().max(180).nullable().optional(),
  phone:z.string().trim().max(80).nullable().optional(),
  email:z.string().trim().email().max(240).nullable().optional(),
  telegram:z.string().trim().max(120).nullable().optional(),
  whatsapp:z.string().trim().max(120).nullable().optional(),
  maxContact:z.string().trim().max(120).nullable().optional(),
  preferredChannel:channel.nullable().optional(),
});
type Scope={id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string};
async function assertEditable(actor:NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>,clientId:string,sql:Sql){
  const [row]=await sql<Scope[]>`
    SELECT id,id "clientId",organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",
      assigned_team_id "teamId",region_id "regionId"
    FROM client_companies WHERE id=${clientId}::uuid
  `;
  if(!row)throw new Error("Клиент не найден");
  if(!canReadRow(actor.access,"sales.client.edit",row,actor))throw new AccessDeniedError("sales.client.edit");
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Необходимо войти в систему"},{status:401});
    requireCapability(actor,"sales.client.edit");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;
    const body=schema.parse(await request.json());
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>{
      await assertEditable(actor,id,sql);
      const [created]=await sql<Array<{id:string}>>`
        INSERT INTO contacts(
          organization_id,client_company_id,full_name,position,phone,email,telegram,whatsapp,max_contact,communication_preference,
          owner_user_id,created_by_user_id
        ) VALUES(
          ${actor.organizationId}::uuid,${id}::uuid,${body.fullName},${body.position??null},${body.phone??null},${body.email??null},
          ${body.telegram??null},${body.whatsapp??null},${body.maxContact??null},${body.preferredChannel??null},
          ${actor.userId}::uuid,${actor.userId}::uuid
        ) RETURNING id
      `;
      await sql`UPDATE client_companies SET updated_at=now() WHERE id=${id}::uuid`;
      await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'client',${id}::uuid,'contact_added','Добавлен контакт клиента')`;
      return created;
    });
    return NextResponse.json(row,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные контакта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для изменения клиента"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось добавить контакт"},{status:500});
  }
}
