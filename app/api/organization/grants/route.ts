import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  targetType:z.enum(["position","process_role"]),
  targetId:z.string().uuid(),
  capability:z.string().min(3).max(160),
  effect:z.enum(["inherit","allow","deny"]),
  scopeType:z.enum(["self","own_created","assigned_to_me","team","org_unit","region","objects","clients","all_org"]).optional(),
  scopeIds:z.array(z.string().uuid()).max(200).default([]),
});

export async function GET(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});requireCapability(actor,"organization.read");
    const url=new URL(request.url);const targetType=url.searchParams.get("targetType");const targetId=url.searchParams.get("targetId");
    if(!["position","process_role"].includes(targetType??"")||!targetId||!/^[0-9a-f-]{36}$/i.test(targetId))return NextResponse.json({error:"Некорректная цель"},{status:400});
    if(actor.demo)return NextResponse.json({items:[]});
    const items=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const table=targetType==="position"?"position_permission_grants":"process_role_permission_grants";const column=targetType==="position"?"position_id":"process_role_id";
      return sql.unsafe<Array<{capability:string;description:string;domain:string;effect:string;scopeType:string|null;scopeIds:string[]}>>(`SELECT d.capability,d.description,d.domain,COALESCE(g.effect,'inherit') effect,g.scope_type "scopeType",COALESCE(g.scope_ids,'{}'::uuid[]) "scopeIds" FROM permission_definitions d LEFT JOIN ${table} g ON g.capability=d.capability AND g.${column}=$1::uuid ORDER BY d.domain,d.capability`,[targetId]);
    });return NextResponse.json({items});
  }catch(error){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Не удалось загрузить права"},{status:500})}
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"organization.access.manage");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});
    const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>{
      const table=body.targetType==="position"?"position_permission_grants":"process_role_permission_grants";
      const column=body.targetType==="position"?"position_id":"process_role_id";
      const [target]=body.targetType==="position"
        ? await sql<Array<{id:string}>>`SELECT id FROM positions WHERE id=${body.targetId}::uuid`
        : await sql<Array<{id:string}>>`SELECT id FROM process_roles WHERE id=${body.targetId}::uuid`;
      if(!target)throw new Error("NOT_FOUND");
      const [definition]=await sql<Array<{capability:string}>>`SELECT capability FROM permission_definitions WHERE capability=${body.capability}`;
      if(!definition)throw new Error("UNKNOWN_CAPABILITY");
      await sql.unsafe(`DELETE FROM ${table} WHERE ${column}=$1 AND capability=$2`,[body.targetId,body.capability]);
      if(body.effect!=="inherit")await sql.unsafe(
        `INSERT INTO ${table}(organization_id,${column},capability,effect,scope_type,scope_ids) VALUES($1,$2,$3,$4,$5,$6::uuid[])`,
        [actor.organizationId,body.targetId,body.capability,body.effect,body.scopeType??"all_org",body.scopeIds]
      );
    });
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры права",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить наследуемое право"},{status:500});
  }
}
