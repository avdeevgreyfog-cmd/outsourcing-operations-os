import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const nullableText=(max:number)=>z.string().trim().max(max).nullable().optional();
const schema=z.object({
  name:z.string().trim().min(2).max(160),
  legalName:nullableText(240),
  inn:nullableText(20),
  notes:nullableText(5000),
  status:z.enum(["active","inactive","blocked","archived"]),
  ownerUserId:z.string().uuid().nullable().optional(),
  regionId:z.string().uuid().nullable().optional(),
  teamId:z.string().uuid().nullable().optional(),
});
type ScopeRow={
  id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string;
  name:string;legalName:string|null;inn:string|null;notes:string|null;status:string;
};
function canAssign(actor:NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>){
  return actor.roleCode==="director"||actor.access.allOrg||hasCapability(actor.access,"organization.manage");
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Необходимо войти в систему"},{status:401});
    requireCapability(actor,"sales.client.edit");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      const [current]=await tx<ScopeRow[]>`
        SELECT id,id "clientId",organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",
          assigned_team_id "teamId",region_id "regionId",name,legal_name "legalName",inn,notes,status
        FROM client_companies WHERE id=${id}::uuid FOR UPDATE
      `;
      if(!current)return null;
      if(!canReadRow(actor.access,"sales.client.edit",current,actor))throw new AccessDeniedError("sales.client.edit");

      const assignmentAllowed=canAssign(actor);
      const nextOwner=assignmentAllowed?(body.ownerUserId??null):current.ownerUserId;
      const nextRegion=assignmentAllowed?(body.regionId??null):current.regionId;
      const nextTeam=assignmentAllowed?(body.teamId??null):current.teamId;

      if(assignmentAllowed&&nextOwner){
        const [member]=await tx<Array<{id:string}>>`SELECT user_id id FROM organization_memberships WHERE user_id=${nextOwner}::uuid AND status='active'`;
        if(!member)throw new Error("Ответственный не состоит в текущей организации");
      }
      if(assignmentAllowed&&nextRegion){
        const [region]=await tx<Array<{id:string}>>`SELECT id FROM regions WHERE id=${nextRegion}::uuid`;
        if(!region)throw new Error("Регион не найден в текущей организации");
      }
      if(assignmentAllowed&&nextTeam){
        const [team]=await tx<Array<{id:string}>>`SELECT id FROM teams WHERE id=${nextTeam}::uuid`;
        if(!team)throw new Error("Команда не найдена в текущей организации");
      }

      await tx`
        UPDATE client_companies SET
          name=${body.name},
          legal_name=${body.legalName??null},
          inn=${body.inn??null},
          notes=${body.notes??null},
          status=${body.status},
          owner_user_id=${nextOwner}::uuid,
          region_id=${nextRegion}::uuid,
          assigned_team_id=${nextTeam}::uuid,
          updated_at=now()
        WHERE id=${id}::uuid
      `;
      return {id};
    });
    if(!result)return NextResponse.json({error:"Клиент не найден"},{status:404});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполненные поля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для изменения клиента"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить клиента"},{status:500});
  }
}
