import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({body:z.string().trim().min(1).max(8000)});
type Scope={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.edit");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const created=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [scope]=await sql<Scope[]>`SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId" FROM tenders WHERE id=${id}::uuid`;
      if(!scope||!canReadRow(actor.access,"sales.tender.edit",scope,actor))throw new AccessDeniedError("sales.tender.edit");
      const [row]=await sql<Array<{id:string}>>`INSERT INTO comments(organization_id,entity_type,entity_id,body,created_by_user_id) VALUES(${actor.organizationId}::uuid,'tender',${id}::uuid,${body.body},${actor.userId}::uuid) RETURNING id`;
      await sql`UPDATE tenders SET updated_at=now() WHERE id=${id}::uuid`;
      await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${id}::uuid,'commented','Добавлен комментарий')`;
      return row;
    });
    return NextResponse.json(created,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Комментарий пуст или слишком длинный"},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
