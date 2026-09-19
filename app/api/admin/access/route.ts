import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { hasCapability } from "@/lib/core/access.mjs";
import { isSystemAdminCapability } from "@/lib/access/system";

const schema=z.object({
  membershipId:z.string().uuid(),
  capability:z.string().min(3).max(160),
  effect:z.enum(["inherit","allow","deny"]),
  scopeType:z.enum(["self","own_created","assigned_to_me","team","org_unit","org_unit_subtree","region","objects","clients","all_org"]).optional(),
  scopeIds:z.array(z.string().uuid()).max(200).optional(),
});

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"admin.permissions.manage");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});
    const body=schema.parse(await request.json());

    await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [target]=await sql<Array<{id:string}>>`
        SELECT id FROM organization_memberships
        WHERE id=${body.membershipId}::uuid
          AND organization_id=${actor.organizationId}::uuid
      `;
      if(!target)throw new AccessDeniedError("admin.permissions.manage");

      const [ownership]=await sql<Array<{isOwner:boolean}>>`
        SELECT EXISTS(
          SELECT 1 FROM organization_owners
          WHERE organization_id=${actor.organizationId}::uuid
            AND membership_id=${actor.membershipId}::uuid
        ) "isOwner"
      `;
      const isOwner=Boolean(ownership?.isOwner);
      if(body.membershipId===actor.membershipId&&!isOwner)throw new Error("SELF_EDIT");

      const [definition]=await sql<Array<{capability:string;fieldSensitive:boolean}>>`
        SELECT capability,field_sensitive "fieldSensitive"
        FROM permission_definitions
        WHERE capability=${body.capability}
      `;
      if(!definition)throw new Error("UNKNOWN_CAPABILITY");
      if(isSystemAdminCapability(body.capability))throw new Error("SYSTEM_ADMIN");
      if(body.effect==="allow"&&definition.fieldSensitive&&!isOwner&&!hasCapability(actor.access,body.capability))throw new Error("SENSITIVE_ESCALATION");

      await sql`
        DELETE FROM user_permission_overrides
        WHERE membership_id=${body.membershipId}::uuid
          AND capability=${body.capability}
      `;

      if(body.effect!=="inherit"){
        await sql`
          INSERT INTO user_permission_overrides(
            organization_id,membership_id,capability,effect,scope_type,scope_ids,changed_by_user_id
          ) VALUES(
            ${actor.organizationId}::uuid,
            ${body.membershipId}::uuid,
            ${body.capability},
            ${body.effect},
            ${body.effect==="allow"?body.scopeType??"assigned_to_me":null},
            ${body.scopeIds??[]}::uuid[],
            ${actor.userId}::uuid
          )
        `;
      }
    });

    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры доступа",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof Error&&error.message==="SELF_EDIT")return NextResponse.json({error:"Администратор не может расширять собственные права"},{status:403});
    if(error instanceof Error&&error.message==="SYSTEM_ADMIN")return NextResponse.json({error:"Системные полномочия назначаются в отдельном блоке администрирования"},{status:400});
    if(error instanceof Error&&error.message==="SENSITIVE_ESCALATION")return NextResponse.json({error:"Нельзя делегировать чувствительный доступ, которого нет у администратора"},{status:403});
    if(error instanceof Error&&error.message==="UNKNOWN_CAPABILITY")return NextResponse.json({error:"Неизвестное разрешение"},{status:400});
    console.error(error);
    return NextResponse.json({error:"Не удалось сохранить индивидуальное правило"},{status:500});
  }
}
