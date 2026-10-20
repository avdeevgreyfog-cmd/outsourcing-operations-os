import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow,hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import {listEligibleObjectManagers,listEligibleObjectRecruiters} from "./object-manager-options";
import * as demo from "@/lib/demo/data";
import * as demoOrg from "@/lib/demo/organization";

export type ObjectPersonOption={id:string;name:string};
export type ObjectManagementOptions={
  clients:Array<{id:string;name:string}>;
  legalEntities:Array<{id:string;name:string;shortName:string|null;primary:boolean}>;
  regions:Array<{id:string;name:string}>;
  managers:ObjectPersonOption[];
  recruiters:ObjectPersonOption[];
  requisitesPermissions?:{client:boolean;legalEntity:boolean};
  creationPermissions?:{client:boolean;legalEntity:boolean;region:boolean};
};
export type ObjectHistoryRow={id:string;createdAt:string;actor:string;verb:string;summary:string;metadata:Record<string,unknown>};

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
  const requisitesPermissions={client:hasCapability(actor.access,"sales.client.edit"),legalEntity:hasCapability(actor.access,"organization.manage")};
  const creationPermissions={client:hasCapability(actor.access,"sales.client.create"),legalEntity:hasCapability(actor.access,"organization.manage"),region:hasCapability(actor.access,"admin.permissions.manage")};
  const includeCreation=options.includeCreation!==false;
  const includeAssignments=options.includeAssignments!==false;
  if(actor.demo){
    const managers=includeAssignments?demoOrg.companyEmployees
      .filter(item=>item.status==="active"&&(item.position??"")==="Менеджер объекта")
      .map(item=>({id:item.userId,name:item.name})):[];
    const recruiters=includeAssignments?demoOrg.companyEmployees
      .filter(item=>item.status==="active"&&(item.position??"").toLocaleLowerCase("ru").includes("подбор"))
      .map(item=>({id:item.userId,name:item.name})):[];
    return {
      creationPermissions,requisitesPermissions,
      clients:includeCreation?demo.clients.map(item=>({id:item.id,name:item.name})):[],
      legalEntities:demoOrg.companyProfile.legalEntities.map(item=>({id:item.id,name:item.name,shortName:item.shortName??null,primary:item.primary})),
      regions:includeCreation?demoOrg.companyProfile.regions.map(item=>({id:item.id,name:item.name})):[],
      managers,
      recruiters,
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [clients,legalEntities,regions,managers,recruiters]=await Promise.all([
      includeCreation?sql<Array<{id:string;name:string;organizationId:string;ownerUserId:string|null;createdByUserId:string|null;regionId:string|null;teamId:string|null}>>`
        SELECT id,name,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId"
        FROM client_companies WHERE status<>'archived' ORDER BY name
      `.then(rows=>rows.filter(row=>canReadRow(actor.access,"sales.client.read",{...row,clientId:row.id},actor)).map(({id,name})=>({id,name}))):Promise.resolve([]),
      sql<Array<{id:string;name:string;shortName:string|null;primary:boolean}>>`
        SELECT id,name,short_name "shortName",is_primary "primary"
        FROM legal_entities WHERE active ORDER BY is_primary DESC,name
      `,
      includeCreation?sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`:Promise.resolve([]),
      includeAssignments?listEligibleObjectManagers(sql,actor.organizationId):Promise.resolve([]),
      includeAssignments?listEligibleObjectRecruiters(sql,actor.organizationId):Promise.resolve([]),
    ]);
    return {clients,legalEntities,regions,managers,recruiters,creationPermissions,requisitesPermissions};
  });
}


export async function listObjectHistory(actor:Actor,objectId:string,limit=100):Promise<ObjectHistoryRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const object=demo.objects.find(item=>item.id===objectId);
    if(!object)return [];
    return [{
      id:`demo-object-origin-${object.id}`,
      createdAt:"Демо-снимок",
      actor:"Система",
      verb:object.sourceProposalId?"created_from_proposal":"created_manual",
      summary:object.sourceProposalId?"Объект связан с согласованным коммерческим предложением":"Объект добавлен вручную",
      metadata:{sourceRequestId:object.sourceRequestId??null,sourceProposalId:object.sourceProposalId??null},
    }];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{
      organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;clientId:string|null;createdByUserId:string;
      sourceRequestId:string|null;sourceProposalId:string|null;createdAt:string;assigneeUserIds:string[];
    }>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        o.client_company_id "clientId",o.created_by_user_id "createdByUserId",o.source_request_id "sourceRequestId",o.source_proposal_id "sourceProposalId",
        to_char(o.created_at,'DD.MM.YYYY HH24:MI') "createdAt",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.id=${objectId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"operations.object.read",scope,actor))return [];
    const events=await sql<ObjectHistoryRow[]>`
      SELECT e.id,to_char(e.created_at,'DD.MM.YYYY HH24:MI') "createdAt",COALESCE(u.display_name,'Система') actor,
        e.verb,e.summary,COALESCE(e.metadata,'{}'::jsonb) metadata
      FROM activity_events e
      LEFT JOIN app_users u ON u.id=e.actor_user_id
      WHERE e.entity_type='object' AND e.entity_id=${objectId}::uuid
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;
    const hasCreation=events.some(item=>["created_manual","created_from_proposal","created"].includes(item.verb));
    if(!hasCreation){
      events.push({
        id:`object-origin-${objectId}`,
        createdAt:scope.createdAt,
        actor:"Система",
        verb:scope.sourceProposalId?"created_from_proposal":"created",
        summary:scope.sourceProposalId?"Объект создан из согласованного КП":"Объект создан",
        metadata:{sourceRequestId:scope.sourceRequestId,sourceProposalId:scope.sourceProposalId},
      });
    }
    return events;
  });
}
