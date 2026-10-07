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

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;contactId:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Необходимо войти в систему"},{status:401});
    requireCapability(actor,"sales.client.edit");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id,contactId}=await params;
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>{
      await assertEditable(actor,id,sql);
      const [contact]=await sql<Array<{id:string}>>`SELECT id FROM contacts WHERE id=${contactId}::uuid AND client_company_id=${id}::uuid`;
      if(!contact)return null;
      await sql`
        UPDATE contacts SET
          full_name=${body.fullName},
          position=${body.position??null},
          phone=${body.phone??null},
          email=${body.email??null},
          telegram=${body.telegram??null},
          whatsapp=${body.whatsapp??null},
          max_contact=${body.maxContact??null},
          communication_preference=${body.preferredChannel??null}
        WHERE id=${contactId}::uuid AND client_company_id=${id}::uuid
      `;
      await sql`UPDATE client_companies SET updated_at=now() WHERE id=${id}::uuid`;
      await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'client',${id}::uuid,'contact_updated','Обновлён контакт клиента')`;
      return {id:contactId};
    });
    if(!result)return NextResponse.json({error:"Контакт не найден"},{status:404});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные контакта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для изменения клиента"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить контакт"},{status:500});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string;contactId:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Необходимо войти в систему"},{status:401});
    requireCapability(actor,"sales.client.edit");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id,contactId}=await params;
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      await assertEditable(actor,id,tx);
      const [contact]=await tx<Array<{id:string}>>`SELECT id FROM contacts WHERE id=${contactId}::uuid AND client_company_id=${id}::uuid FOR UPDATE`;
      if(!contact)return null;
      const [usage]=await tx<Array<{requestCount:number;objectCount:number}>>`
        SELECT
          (SELECT count(*)::int FROM requests WHERE contact_id=${contactId}::uuid) "requestCount",
          (SELECT count(*)::int FROM object_contact_assignments WHERE contact_id=${contactId}::uuid AND active) "objectCount"
      `;
      if((usage?.requestCount??0)>0)throw new Error("Контакт используется в заявках. Сначала измените контакт в связанных заявках");
      if((usage?.objectCount??0)>0)throw new Error("Контакт назначен на объект. Сначала снимите его с объекта");
      await tx`DELETE FROM contacts WHERE id=${contactId}::uuid AND client_company_id=${id}::uuid`;
      await tx`UPDATE client_companies SET updated_at=now() WHERE id=${id}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'client',${id}::uuid,'contact_removed','Удалён контакт клиента')`;
      return {ok:true};
    });
    if(!result)return NextResponse.json({error:"Контакт не найден"},{status:404});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для изменения клиента"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось удалить контакт"},{status:500});
  }
}
