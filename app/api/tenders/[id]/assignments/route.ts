import {NextResponse} from "next/server";
import {z} from "zod";
import type {Sql} from "postgres";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({assignments:z.array(z.object({roleCode:z.enum(["owner","analyst","calculator","documents","legal","approver","submission"]),userId:z.string().uuid()})).max(30)});
type Scope={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null};
async function assertEditable(actor:NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>,id:string,sql:Sql){const [row]=await sql<Scope[]>`SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId" FROM tenders WHERE id=${id}::uuid`;if(!row||!canReadRow(actor.access,"sales.tender.edit",row,actor))throw new AccessDeniedError("sales.tender.edit");}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"sales.tender.edit");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});const {id}=await params;const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{await assertEditable(actor,id,tx);const users=[...new Set(body.assignments.map(item=>item.userId))];if(users.length){const rows=await tx<Array<{id:string}>>`SELECT user_id id FROM organization_memberships WHERE user_id=ANY(${users}::uuid[]) AND status='active'`;if(rows.length!==users.length)throw new Error("Один из сотрудников недоступен в этой организации");}await tx`DELETE FROM tender_assignments WHERE tender_id=${id}::uuid`;for(const item of body.assignments)await tx`INSERT INTO tender_assignments(organization_id,tender_id,role_code,user_id,assigned_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${item.roleCode},${item.userId}::uuid,${actor.userId}::uuid)`;const owner=body.assignments.find(item=>item.roleCode==="owner");if(owner)await tx`UPDATE tenders SET owner_user_id=${owner.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;else await tx`UPDATE tenders SET updated_at=now() WHERE id=${id}::uuid`;await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${id}::uuid,'assigned','Обновлена команда тендера')`; }));return NextResponse.json({ok:true});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте распределение ролей"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});}
}
