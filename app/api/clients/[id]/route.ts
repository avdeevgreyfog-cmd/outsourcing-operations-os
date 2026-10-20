import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

import {assertEditVersion,EditConflictError} from "@/lib/commercial/edit-conflict";

import {editChanges,clientEditLabels} from "@/lib/commercial/edit-history";

const nullableText=(max:number)=>z.string().trim().max(max).nullable().optional();
const schema=z.object({
  expectedUpdatedAt:z.string().optional(),
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
  updatedAt:string;name:string;legalName:string|null;inn:string|null;notes:string|null;status:string;
};
function canAssign(actor:NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>){
  return actor.roleCode==="director"||hasCapability(actor.access,"organization.manage")||(actor.access.scopes["sales.client.edit"]??[]).some(scope=>scope.type==="all_org");
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
          assigned_team_id "teamId",region_id "regionId",name,legal_name "legalName",inn,notes,status,updated_at::text "updatedAt"
        FROM client_companies WHERE id=${id}::uuid FOR UPDATE
      `;
      if(!current)return null;
      if(!canReadRow(actor.access,"sales.client.edit",current,actor))throw new AccessDeniedError("sales.client.edit");

      assertEditVersion(body.expectedUpdatedAt,current.updatedAt);
      const assignmentAllowed=canAssign(actor);
      const nextOwner=assignmentAllowed?(body.ownerUserId===undefined?current.ownerUserId:body.ownerUserId):current.ownerUserId;
      const nextRegion=assignmentAllowed?(body.regionId===undefined?current.regionId:body.regionId):current.regionId;
      const nextTeam=assignmentAllowed?(body.teamId===undefined?current.teamId:body.teamId):current.teamId;

      if(assignmentAllowed&&nextOwner&&nextOwner!==current.ownerUserId){
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

      const changes=editChanges(current,{...current,...body,ownerUserId:nextOwner,regionId:nextRegion,teamId:nextTeam},clientEditLabels);
      await tx`
        UPDATE client_companies SET
          name=${body.name},
          legal_name=${body.legalName===undefined?current.legalName:body.legalName},
          inn=${body.inn===undefined?current.inn:body.inn},
          notes=${body.notes===undefined?current.notes:body.notes},
          status=${body.status},
          owner_user_id=${nextOwner}::uuid,
          region_id=${nextRegion}::uuid,
          assigned_team_id=${nextTeam}::uuid,
          updated_at=now()
        WHERE id=${id}::uuid
      `;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'client',${id}::uuid,'updated',${changes.length?`Обновлены данные клиента: ${changes.map(x=>x.label).join(', ')}`:'Обновлены данные клиента'},${tx.json(JSON.parse(JSON.stringify({changes})))})`;
      return {id};
    });
    if(!result)return NextResponse.json({error:"Клиент не найден"},{status:404});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof EditConflictError)return NextResponse.json({error:error.message},{status:409});
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполненные поля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для изменения клиента"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить клиента"},{status:500});
  }
}
