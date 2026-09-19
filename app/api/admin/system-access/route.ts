import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { SYSTEM_ADMIN_CAPABILITY_SET } from "@/lib/access/system";

const schema=z.object({
  membershipId:z.string().uuid(),
  capability:z.string().min(3).max(160),
  enabled:z.boolean(),
  reason:z.string().trim().max(500).optional(),
});

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"admin.system_access.manage");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});
    const body=schema.parse(await request.json());
    if(!SYSTEM_ADMIN_CAPABILITY_SET.has(body.capability))return NextResponse.json({error:"Это не системное полномочие"},{status:400});

    await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [target]=await sql<Array<{id:string}>>`
        SELECT id FROM organization_memberships
        WHERE id=${body.membershipId}::uuid
          AND organization_id=${actor.organizationId}::uuid
      `;
      if(!target)throw new Error("NOT_FOUND");

      const [actorOwner]=await sql<Array<{isOwner:boolean}>>`
        SELECT EXISTS(
          SELECT 1 FROM organization_owners
          WHERE organization_id=${actor.organizationId}::uuid
            AND membership_id=${actor.membershipId}::uuid
        ) "isOwner"
      `;
      const [targetOwner]=await sql<Array<{isOwner:boolean}>>`
        SELECT EXISTS(
          SELECT 1 FROM organization_owners
          WHERE organization_id=${actor.organizationId}::uuid
            AND membership_id=${body.membershipId}::uuid
        ) "isOwner"
      `;
      const isActorOwner=Boolean(actorOwner?.isOwner);
      if(targetOwner?.isOwner&&!body.enabled)throw new Error("OWNER_LOCK");
      if(body.membershipId===actor.membershipId&&!isActorOwner)throw new Error("SELF_EDIT");
      if(body.capability==="admin.system_access.manage"&&!isActorOwner)throw new Error("OWNER_ONLY");

      if(body.enabled){
        await sql`
          INSERT INTO membership_system_grants(
            organization_id,membership_id,capability,granted_by_user_id,reason
          ) VALUES(
            ${actor.organizationId}::uuid,
            ${body.membershipId}::uuid,
            ${body.capability},
            ${actor.userId}::uuid,
            ${body.reason??null}
          )
          ON CONFLICT (membership_id,capability) WHERE valid_to IS NULL
          DO UPDATE SET granted_by_user_id=EXCLUDED.granted_by_user_id,reason=EXCLUDED.reason,valid_from=now()
        `;
      }else{
        await sql`
          UPDATE membership_system_grants
          SET valid_to=now()
          WHERE membership_id=${body.membershipId}::uuid
            AND capability=${body.capability}
            AND valid_to IS NULL
        `;
      }
    });

    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры системного доступа",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Сотрудник не найден"},{status:404});
    if(error instanceof Error&&error.message==="OWNER_LOCK")return NextResponse.json({error:"Полномочия владельца организации нельзя отключить здесь"},{status:409});
    if(error instanceof Error&&error.message==="SELF_EDIT")return NextResponse.json({error:"Администратор не может расширять собственные системные полномочия"},{status:403});
    if(error instanceof Error&&error.message==="OWNER_ONLY")return NextResponse.json({error:"Право делегировать администраторов может выдать только владелец организации"},{status:403});
    console.error(error);
    return NextResponse.json({error:"Не удалось изменить системные полномочия"},{status:500});
  }
}
