import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import * as demoOrg from "@/lib/demo/organization";

export type ObjectPersonOption={id:string;name:string};
export type ObjectManagementOptions={
  clients:Array<{id:string;name:string}>;
  legalEntities:Array<{id:string;name:string;shortName:string|null;primary:boolean}>;
  regions:Array<{id:string;name:string}>;
  managers:ObjectPersonOption[];
  recruiters:ObjectPersonOption[];
};

export async function getLegalEntityOptions(actor:Actor,capability:string){
  requireCapability(actor,capability);
  if(actor.demo)return demoOrg.companyProfile.legalEntities.map(item=>({
    id:item.id,name:item.name,shortName:item.shortName??null,primary:item.primary,
  }));
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<Array<{id:string;name:string;shortName:string|null;primary:boolean}>>`
    SELECT id,name,short_name "shortName",is_primary "primary"
    FROM legal_entities
    WHERE active
    ORDER BY is_primary DESC,name
  `);
}

export async function getObjectManagementOptions(actor:Actor,options:{includeCreation?:boolean;includeAssignments?:boolean}={}):Promise<ObjectManagementOptions>{
  requireCapability(actor,"operations.object.read");
  const includeCreation=options.includeCreation===true;
  const includeAssignments=options.includeAssignments!==false;
  if(actor.demo){
    const managers=includeAssignments?demoOrg.companyEmployees
      .filter(item=>item.status==="active"&&(item.position.includes("Менеджер объекта")||item.position.includes("Руководитель объектов")))
      .map(item=>({id:item.userId,name:item.name})):[];
    const recruiters=includeAssignments?demoOrg.companyEmployees
      .filter(item=>item.status==="active"&&item.position.toLocaleLowerCase("ru").includes("подбор"))
      .map(item=>({id:item.userId,name:item.name})):[];
    return {
      clients:includeCreation?demo.clients.map(item=>({id:item.id,name:item.name})):[],
      legalEntities:demoOrg.companyProfile.legalEntities.map(item=>({id:item.id,name:item.name,shortName:item.shortName??null,primary:item.primary})),
      regions:includeCreation?demoOrg.companyProfile.regions.map(item=>({id:item.id,name:item.name})):[],
      managers,
      recruiters,
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [clients,legalEntities,regions,managers,recruiters]=await Promise.all([
      includeCreation?sql<Array<{id:string;name:string}>>`
        SELECT id,name FROM client_companies WHERE status<>'archived' ORDER BY name
      `:Promise.resolve([]),
      sql<Array<{id:string;name:string;shortName:string|null;primary:boolean}>>`
        SELECT id,name,short_name "shortName",is_primary "primary"
        FROM legal_entities WHERE active ORDER BY is_primary DESC,name
      `,
      includeCreation?sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`:Promise.resolve([]),
      includeAssignments?sql<ObjectPersonOption[]>`
        SELECT DISTINCT m.user_id id,u.display_name name
        FROM organization_memberships m
        JOIN app_users u ON u.id=m.user_id
        LEFT JOIN role_templates rt ON rt.id=m.role_template_id
        WHERE m.status='active'
          AND (
            rt.code IN ('director','object_manager','regional_manager','operations_head')
            OR EXISTS (
              SELECT 1 FROM permission_grants pg
              WHERE pg.role_template_id=m.role_template_id
                AND pg.capability='operations.object.edit' AND pg.effect='allow'
            )
            OR EXISTS (
              SELECT 1
              FROM position_assignments pa
              JOIN staff_positions sp ON sp.id=pa.staff_position_id
              JOIN position_permission_grants ppg ON ppg.position_id=sp.job_profile_id
              WHERE pa.membership_id=m.id
                AND pa.status<>'ended'
                AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
                AND ppg.capability='operations.object.edit' AND ppg.effect='allow'
            )
          )
        ORDER BY name
      `:Promise.resolve([]),
      includeAssignments?sql<ObjectPersonOption[]>`
        SELECT DISTINCT m.user_id id,u.display_name name
        FROM organization_memberships m
        JOIN app_users u ON u.id=m.user_id
        LEFT JOIN role_templates rt ON rt.id=m.role_template_id
        WHERE m.status='active'
          AND (
            rt.code IN ('recruiter','recruiting_manager','recruitment_head')
            OR EXISTS (
              SELECT 1 FROM permission_grants pg
              WHERE pg.role_template_id=m.role_template_id
                AND pg.capability IN ('recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign')
                AND pg.effect='allow'
            )
            OR EXISTS (
              SELECT 1
              FROM position_assignments pa
              JOIN staff_positions sp ON sp.id=pa.staff_position_id
              JOIN position_permission_grants ppg ON ppg.position_id=sp.job_profile_id
              WHERE pa.membership_id=m.id
                AND pa.status<>'ended'
                AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
                AND ppg.capability IN ('recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign')
                AND ppg.effect='allow'
            )
          )
        ORDER BY name
      `:Promise.resolve([]),
    ]);
    return {clients,legalEntities,regions,managers,recruiters};
  });
}
