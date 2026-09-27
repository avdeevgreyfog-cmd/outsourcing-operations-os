import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { defaultPrimarySiteVisitChecklist, mergePrimarySiteVisitChecklist } from "@/lib/operations/launch-checklist";
import type { SiteVisitChecklistItem } from "@/lib/operations/launch-checklist";
export type { SiteVisitChecklistItem, SiteVisitChecklistStatus } from "@/lib/operations/launch-checklist";

export type LaunchPlanRow={
  id:string;organizationId:string;objectId:string;object:string;clientId:string;client:string;regionId:string;
  ownerUserId:string|null;ownerName:string|null;assigneeUserIds:string[];
  targetDate:string;forecastDate:string|null;phase:"preparation"|"ready"|"active"|"completed"|"cancelled";
  progress:number;risk:string;stabilizationDays:number;actualStartDate:string|null;completedAt:string|null;contractId:string|null;contractStatus:string|null;contractGate:"blocked"|"ready"|"exception"|null;
};

export type LaunchStaffingWaveRow={
  id:string;organizationId:string;launchId:string;objectId:string;name:string;targetDate:string;plannedCount:number;
  specialtyId:string|null;specialty:string|null;needId:string|null;note:string|null;status:"planned"|"in_progress"|"completed"|"cancelled";
};

export type LaunchAssigneeOption={id:string;name:string};

export type LaunchSiteVisitRow={
  id:string;organizationId:string;launchId:string;objectId:string;visitType:"primary"|"launch_control"|"audit"|"other";
  scheduledDate:string|null;ownerUserId:string|null;owner:string|null;status:"planned"|"in_progress"|"completed"|"cancelled";
  checklist:SiteVisitChecklistItem[];notes:string|null;completedAt:string|null;
};

function isoFromShort(value:string|null|undefined){
  if(!value)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const match=value.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);
  return match?`${match[3]??"2026"}-${match[2]}-${match[1]}`:null;
}
function addDays(value:string,days:number){const d=new Date(value+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

export async function listLaunchPlans(actor:Actor):Promise<LaunchPlanRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const objectIds=[...new Set(demo.launchTasks.map(row=>row.objectId))];
    return objectIds.map((objectId,index)=>{
      const object=demo.objects.find(row=>row.id===objectId)!;
      const tasks=demo.launchTasks.filter(row=>row.objectId===objectId);
      const target=isoFromShort((object as {targetStartDate?:string;targetStart?:string}).targetStartDate??(object as {targetStart?:string}).targetStart)??"2026-10-01";
      const progress=tasks.length?Math.round(tasks.reduce((sum,row)=>sum+Number(row.progress||0),0)/tasks.length):0;
      const ownerName=(object as {ownerName?:string}).ownerName??null;
      return {id:`demo-launch-${index+1}`,organizationId:actor.organizationId,objectId,object:object.name,clientId:object.clientId,client:object.client,regionId:object.regionId,ownerUserId:object.ownerUserId??null,ownerName,assigneeUserIds:object.assigneeUserIds??[],targetDate:target,forecastDate:target,phase:progress>=100?"completed":"preparation",progress,risk:object.risk??"normal",stabilizationDays:7,actualStartDate:(object as {actualStartDate?:string|null}).actualStartDate??null,completedAt:null,contractId:null,contractStatus:"signed",contractGate:"ready"};
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<LaunchPlanRow[]>`
      SELECT l.id,l.organization_id "organizationId",l.object_id "objectId",o.name object,o.client_company_id "clientId",c.name client,
        o.region_id "regionId",o.owner_user_id "ownerUserId",u.display_name "ownerName",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
        l.target_date::text "targetDate",l.forecast_date::text "forecastDate",l.phase,l.progress_pct::int progress,l.risk_level risk,l.stabilization_days "stabilizationDays",
        l.actual_start_date::text "actualStartDate",l.completed_at::text "completedAt",
        ct.id "contractId",ct.status "contractStatus",ct.launch_gate "contractGate"
      FROM launches l JOIN objects o ON o.id=l.object_id JOIN client_companies c ON c.id=o.client_company_id
      LEFT JOIN app_users u ON u.id=o.owner_user_id
      LEFT JOIN contracts ct ON ct.id=o.contract_id
      ORDER BY CASE WHEN l.phase IN ('completed','cancelled') THEN 1 ELSE 0 END,l.target_date,o.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}

export async function listLaunchStaffingWaves(actor:Actor):Promise<LaunchStaffingWaveRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const plans=await listLaunchPlans(actor);
    return plans.flatMap(plan=>{
      const object=demo.objects.find(row=>row.id===plan.objectId);
      const total=Math.max(0,Number(object?.required??0));
      if(!total)return [];
      const first=Math.ceil(total/2);
      return [
        {id:plan.id+"-wave-1",organizationId:actor.organizationId,launchId:plan.id,objectId:plan.objectId,name:"Первая волна",targetDate:addDays(plan.targetDate,-7),plannedCount:first,specialtyId:null,specialty:null,needId:null,note:"Базовый план, можно изменить",status:"planned" as const},
        {id:plan.id+"-wave-2",organizationId:actor.organizationId,launchId:plan.id,objectId:plan.objectId,name:"Полный состав",targetDate:plan.targetDate,plannedCount:Math.max(total-first,1),specialtyId:null,specialty:null,needId:null,note:null,status:"planned" as const},
      ];
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<LaunchStaffingWaveRow & {ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[]}>>`
      SELECT w.id,w.organization_id "organizationId",w.launch_id "launchId",l.object_id "objectId",w.name,w.target_date::text "targetDate",
        w.planned_count "plannedCount",w.specialty_id "specialtyId",s.name specialty,w.need_id "needId",w.note,w.status,
        o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM launch_staffing_waves w JOIN launches l ON l.id=w.launch_id JOIN objects o ON o.id=l.object_id
      LEFT JOIN specialties s ON s.id=w.specialty_id
      ORDER BY w.target_date,w.created_at
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}

export async function listLaunchSiteVisits(actor:Actor):Promise<LaunchSiteVisitRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const plans=await listLaunchPlans(actor);
    return plans.slice(0,1).map(plan=>({
      id:plan.id+"-visit-1",organizationId:actor.organizationId,launchId:plan.id,objectId:plan.objectId,visitType:"primary" as const,
      scheduledDate:addDays(plan.targetDate,-10),ownerUserId:plan.ownerUserId,owner:plan.ownerName,status:"planned" as const,
      checklist:defaultPrimarySiteVisitChecklist(),notes:null,completedAt:null,
    }));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<LaunchSiteVisitRow & {regionId:string;clientId:string;assigneeUserIds:string[]}>>`
      SELECT v.id,v.organization_id "organizationId",v.launch_id "launchId",l.object_id "objectId",v.visit_type "visitType",
        v.scheduled_date::text "scheduledDate",v.owner_user_id "ownerUserId",u.display_name owner,v.status,
        v.checklist_json checklist,v.notes,v.completed_at::text "completedAt",
        o.region_id "regionId",o.client_company_id "clientId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM launch_site_visits v JOIN launches l ON l.id=v.launch_id JOIN objects o ON o.id=l.object_id
      LEFT JOIN app_users u ON u.id=v.owner_user_id
      ORDER BY v.scheduled_date NULLS LAST,v.created_at
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor)).map(row=>({
      ...row,
      checklist:row.visitType==="primary"?mergePrimarySiteVisitChecklist(row.checklist):row.checklist,
    }));
  });
}


export async function listLaunchAssignees(actor:Actor):Promise<LaunchAssigneeOption[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const source=(demo as unknown as {organizationEmployees?:Array<{userId:string;name:string;status?:string}>}).organizationEmployees??[];
    if(source.length)return source.filter(item=>item.status!=="inactive").map(item=>({id:item.userId,name:item.name}));
    const names=new Map<string,string>();
    for(const row of demo.launchTasks)if(row.ownerUserId&&row.owner)names.set(row.ownerUserId,row.owner);
    return [...names.entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<LaunchAssigneeOption[]>`
    SELECT DISTINCT m.user_id id,u.display_name name
    FROM organization_memberships m
    JOIN app_users u ON u.id=m.user_id
    WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
    ORDER BY name
  `);
}
