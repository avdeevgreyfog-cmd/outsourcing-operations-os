import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const kind = z.enum(["company","department","region","branch","direction","team","project_group","object_team","other"]);
const createSchema = z.object({ name:z.string().trim().min(2).max(160),code:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),kind,parentId:z.string().uuid().nullable().optional(),regionId:z.string().uuid().nullable().optional(),description:z.string().trim().max(1000).optional(),managerMembershipId:z.string().uuid().nullable().optional() });
const updateSchema = createSchema.partial().extend({ id:z.string().uuid(),active:z.boolean().optional(),sortOrder:z.number().int().min(0).max(10000).optional() });

async function authorize() {
  const actor = await getCurrentActor();
  if (!actor) return { response: NextResponse.json({error:"Требуется вход в систему"},{status:401}) };
  requireCapability(actor,"organization.unit.manage");
  if (actor.demo) return { response: NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409}) };
  return { actor };
}

export async function POST(request:Request) {
  try {
    const auth=await authorize(); if ("response" in auth) return auth.response;
    const body=createSchema.parse(await request.json());
    const row=await withTenant(auth.actor.organizationId,auth.actor.userId,async sql=>{
      if(body.parentId){const [parent]=await sql<Array<{id:string}>>`SELECT id FROM organization_units WHERE id=${body.parentId}::uuid`;if(!parent)throw new Error("PARENT_NOT_FOUND")}
      if(body.regionId){const [region]=await sql<Array<{id:string}>>`SELECT id FROM regions WHERE id=${body.regionId}::uuid`;if(!region)throw new Error("INVALID_ASSIGNMENT")}
      if(body.managerMembershipId){const [manager]=await sql<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE id=${body.managerMembershipId}::uuid`;if(!manager)throw new Error("INVALID_ASSIGNMENT")}
      const [created]=await sql<Array<{id:string}>>`INSERT INTO organization_units(organization_id,parent_id,region_id,manager_membership_id,code,name,kind,description) VALUES(${auth.actor.organizationId}::uuid,${body.parentId??null}::uuid,${body.regionId??null}::uuid,${body.managerMembershipId??null}::uuid,${body.code},${body.name},${body.kind},${body.description??null}) RETURNING id`;return created
    });
    return NextResponse.json({ok:true,id:row.id},{status:201});
  } catch(error){return apiError(error,"Не удалось создать подразделение")}
}

export async function PATCH(request:Request) {
  try {
    const auth=await authorize(); if ("response" in auth) return auth.response;
    const body=updateSchema.parse(await request.json());
    await withTenant(auth.actor.organizationId,auth.actor.userId,async sql=>{
      const [target]=await sql<Array<{id:string}>>`SELECT id FROM organization_units WHERE id=${body.id}::uuid`;if(!target)throw new Error("NOT_FOUND");
      if(body.parentId===body.id)throw new Error("CYCLE");
      if(body.parentId){const cycle=await sql<Array<{id:string}>>`WITH RECURSIVE descendants AS (SELECT id FROM organization_units WHERE parent_id=${body.id}::uuid UNION ALL SELECT u.id FROM organization_units u JOIN descendants d ON u.parent_id=d.id) SELECT id FROM descendants WHERE id=${body.parentId}::uuid`;if(cycle.length)throw new Error("CYCLE")}
      if(body.parentId){const [parent]=await sql<Array<{id:string}>>`SELECT id FROM organization_units WHERE id=${body.parentId}::uuid`;if(!parent)throw new Error("INVALID_ASSIGNMENT")}
      if(body.regionId){const [region]=await sql<Array<{id:string}>>`SELECT id FROM regions WHERE id=${body.regionId}::uuid`;if(!region)throw new Error("INVALID_ASSIGNMENT")}
      if(body.managerMembershipId){const [manager]=await sql<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE id=${body.managerMembershipId}::uuid`;if(!manager)throw new Error("INVALID_ASSIGNMENT")}
      await sql`UPDATE organization_units SET name=COALESCE(${body.name??null},name),code=COALESCE(${body.code??null},code),kind=COALESCE(${body.kind??null},kind),parent_id=CASE WHEN ${body.parentId===undefined} THEN parent_id ELSE ${body.parentId??null}::uuid END,region_id=CASE WHEN ${body.regionId===undefined} THEN region_id ELSE ${body.regionId??null}::uuid END,manager_membership_id=CASE WHEN ${body.managerMembershipId===undefined} THEN manager_membership_id ELSE ${body.managerMembershipId??null}::uuid END,description=COALESCE(${body.description??null},description),active=COALESCE(${body.active??null},active),sort_order=COALESCE(${body.sortOrder??null},sort_order),updated_at=now() WHERE id=${body.id}::uuid`
    });
    return NextResponse.json({ok:true});
  } catch(error){return apiError(error,"Не удалось изменить подразделение")}
}

function apiError(error:unknown,fallback:string){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполнение полей",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof Error&&error.message==="CYCLE")return NextResponse.json({error:"Нельзя переместить подразделение внутрь собственной ветки"},{status:409});if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Подразделение не найдено"},{status:404});if(error instanceof Error&&(error.message==="INVALID_ASSIGNMENT"||error.message==="PARENT_NOT_FOUND"))return NextResponse.json({error:"Родитель, регион или руководитель недоступны в этой компании"},{status:400});console.error(error);return NextResponse.json({error:fallback},{status:500})}
