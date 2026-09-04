import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const createSchema=z.object({name:z.string().trim().min(2).max(160),email:z.string().email().max(320),phone:z.string().trim().max(40).optional(),staffPositionId:z.string().uuid().nullable().optional(),fte:z.number().positive().max(1).default(1),effectiveFrom:z.string().date().optional(),managerMembershipId:z.string().uuid().nullable().optional(),processRoleIds:z.array(z.string().uuid()).max(30).optional()});
const employeeFields=z.object({name:z.string().trim().min(2).max(160),email:z.string().email().max(320),phone:z.string().trim().max(40).nullable().optional(),managerMembershipId:z.string().uuid().nullable().optional(),processRoleIds:z.array(z.string().uuid()).max(30).optional()});
const updateSchema=employeeFields.partial().extend({id:z.string().uuid(),status:z.enum(["active","invited","suspended"]).optional()});
async function currentActor(){const value=await getCurrentActor();if(!value)throw new Error("UNAUTHORIZED");requireCapability(value,"organization.employee.manage");if(value.demo)throw new Error("DEMO");return value}

export async function POST(request:Request){
  try{
    const actor=await currentActor();const body=createSchema.parse(await request.json());
    const membershipId=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [seat]=body.staffPositionId?await sql.unsafe<Array<{id:string;job_profile_id:string;organization_unit_id:string}>>("SELECT id,job_profile_id,organization_unit_id FROM staff_positions WHERE id=$1::uuid AND status NOT IN ('closed','frozen')",[body.staffPositionId]):[];
      if(body.staffPositionId&&!seat)throw new Error("INVALID_ASSIGNMENT");
      if(body.managerMembershipId&&!((await sql.unsafe<Array<{id:string}>>("SELECT id FROM organization_memberships WHERE id=$1::uuid",[body.managerMembershipId]))[0]))throw new Error("INVALID_ASSIGNMENT");
      const roleIds=[...new Set(body.processRoleIds??[])];
      if(roleIds.length){const [matched]=await sql.unsafe<Array<{count:number}>>("SELECT count(*)::int count FROM process_roles WHERE id=ANY($1::uuid[])",[roleIds]);if(matched.count!==roleIds.length)throw new Error("INVALID_ASSIGNMENT")}
      const [existing]=await sql.unsafe<Array<{id:string}>>("SELECT id FROM app_users WHERE email=$1",[body.email]);
      let userId=existing?.id;
      if(!userId){const [created]=await sql.unsafe<Array<{id:string}>>("INSERT INTO app_users(email,display_name) VALUES($1,$2) RETURNING id",[body.email,body.name]);userId=created.id}
      let [roleTemplate]=await sql.unsafe<Array<{id:string}>>("SELECT id FROM role_templates ORDER BY is_system DESC,created_at LIMIT 1");
      if(!roleTemplate)[roleTemplate]=await sql.unsafe<Array<{id:string}>>("INSERT INTO role_templates(organization_id,code,name,description,is_system) VALUES($1::uuid,'member','Сотрудник','Базовый совместимый шаблон доступа',true) RETURNING id",[actor.organizationId]);
      const [membership]=await sql.unsafe<Array<{id:string}>>(
        "INSERT INTO organization_memberships(organization_id,user_id,role_template_id,position_id,primary_org_unit_id,manager_membership_id,phone,status) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,'invited') RETURNING id",
        [actor.organizationId,userId,roleTemplate.id,seat?.job_profile_id??null,seat?.organization_unit_id??null,body.managerMembershipId??null,body.phone??null]
      );
      if(seat){
        const effectiveFrom=body.effectiveFrom??new Date().toISOString().slice(0,10);
        await sql.unsafe("INSERT INTO position_assignments(organization_id,staff_position_id,membership_id,assignment_type,fte,status,effective_from,reason,created_by_user_id) VALUES($1::uuid,$2::uuid,$3::uuid,'primary',$4,CASE WHEN $5::date>current_date THEN 'planned' ELSE 'active' END,$5::date,'Первичное назначение при создании сотрудника',$6::uuid)",[actor.organizationId,seat.id,membership.id,body.fte,effectiveFrom,actor.userId]);
        await sql.unsafe("INSERT INTO membership_organization_units(organization_id,membership_id,organization_unit_id,assignment_type,effective_from) VALUES($1::uuid,$2::uuid,$3::uuid,'primary',$4::date) ON CONFLICT DO NOTHING",[actor.organizationId,membership.id,seat.organization_unit_id,effectiveFrom]);
      }
      for(const roleId of roleIds)await sql.unsafe("INSERT INTO membership_process_roles(organization_id,membership_id,process_role_id,assigned_by_user_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid)",[actor.organizationId,membership.id,roleId,actor.userId]);
      return membership.id;
    });
    return NextResponse.json({ok:true,id:membershipId},{status:201});
  }catch(error){return fail(error,"Не удалось создать сотрудника")}
}

export async function PATCH(request:Request){
  try{
    const actor=await currentActor();const body=updateSchema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [target]=await sql.unsafe<Array<{user_id:string}>>("SELECT user_id FROM organization_memberships WHERE id=$1::uuid",[body.id]);
      if(!target)throw new Error("NOT_FOUND");
      if(body.managerMembershipId===body.id)throw new Error("INVALID_ASSIGNMENT");
      if(body.managerMembershipId&&!((await sql.unsafe<Array<{id:string}>>("SELECT id FROM organization_memberships WHERE id=$1::uuid",[body.managerMembershipId]))[0]))throw new Error("INVALID_ASSIGNMENT");
      const roleIds=[...new Set(body.processRoleIds??[])];
      if(body.processRoleIds&&roleIds.length){const [matched]=await sql.unsafe<Array<{count:number}>>("SELECT count(*)::int count FROM process_roles WHERE id=ANY($1::uuid[])",[roleIds]);if(matched.count!==roleIds.length)throw new Error("INVALID_ASSIGNMENT")}
      if(body.name!==undefined||body.email!==undefined)await sql.unsafe("UPDATE app_users SET display_name=COALESCE($2,display_name),email=COALESCE($3,email),updated_at=now() WHERE id=$1::uuid",[target.user_id,body.name??null,body.email??null]);
      await sql.unsafe(
        "UPDATE organization_memberships SET manager_membership_id=CASE WHEN $2::boolean THEN manager_membership_id ELSE $3::uuid END,phone=CASE WHEN $4::boolean THEN phone ELSE $5 END,status=COALESCE($6,status) WHERE id=$1::uuid",
        [body.id,body.managerMembershipId===undefined,body.managerMembershipId??null,body.phone===undefined,body.phone??null,body.status??null]
      );
      if(body.processRoleIds){await sql.unsafe("DELETE FROM membership_process_roles WHERE membership_id=$1::uuid",[body.id]);for(const roleId of roleIds)await sql.unsafe("INSERT INTO membership_process_roles(organization_id,membership_id,process_role_id,assigned_by_user_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid)",[actor.organizationId,body.id,roleId,actor.userId])}
    });
    return NextResponse.json({ok:true});
  }catch(error){return fail(error,"Не удалось изменить сотрудника")}
}

function fail(error:unknown,message:string){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заполнение полей",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Требуется вход в систему"},{status:401});if(error instanceof Error&&error.message==="DEMO")return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});if(error instanceof Error&&error.message==="NOT_FOUND")return NextResponse.json({error:"Сотрудник не найден"},{status:404});if(error instanceof Error&&error.message==="INVALID_ASSIGNMENT")return NextResponse.json({error:"Должность, подразделение, руководитель или роль недоступны в этой компании"},{status:400});console.error(error);return NextResponse.json({error:message},{status:500})}
