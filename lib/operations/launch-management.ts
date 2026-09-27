import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type LaunchPlanRow={
  id:string;organizationId:string;objectId:string;object:string;clientId:string;client:string;regionId:string;
  ownerUserId:string|null;ownerName:string|null;assigneeUserIds:string[];
  targetDate:string;forecastDate:string|null;phase:"preparation"|"ready"|"active"|"completed"|"cancelled";
  progress:number;risk:string;stabilizationDays:number;
};

export type LaunchStaffingWaveRow={
  id:string;organizationId:string;launchId:string;objectId:string;name:string;targetDate:string;plannedCount:number;
  specialtyId:string|null;specialty:string|null;note:string|null;status:"planned"|"in_progress"|"completed"|"cancelled";
};

export type SiteVisitChecklistStatus="pending"|"confirmed"|"issue"|"na";
export type SiteVisitChecklistItem={
  id:string;section:string;label:string;required:boolean;status:SiteVisitChecklistStatus;
  value:string;note:string;category:string;blocksLaunch:boolean;
};

export type LaunchSiteVisitRow={
  id:string;organizationId:string;launchId:string;objectId:string;visitType:"primary"|"launch_control"|"audit"|"other";
  scheduledDate:string|null;ownerUserId:string|null;owner:string|null;status:"planned"|"in_progress"|"completed"|"cancelled";
  checklist:SiteVisitChecklistItem[];notes:string|null;completedAt:string|null;
};

const checklist=(id:string,section:string,label:string,required=true,category="operations",blocksLaunch=false):SiteVisitChecklistItem=>({
  id,section,label,required,status:"pending",value:"",note:"",category,blocksLaunch,
});

export function defaultPrimarySiteVisitChecklist():SiteVisitChecklistItem[]{
  return [
    checklist("access-entry","Доступ","Точный въезд / проходная и место встречи",true,"access",true),
    checklist("access-contact","Доступ","Кто встречает новых сотрудников и контакт",true,"access",true),
    checklist("access-docs","Доступ","Какие документы нужны для пропуска",true,"access",true),
    checklist("access-deadline","Доступ","За сколько дней подавать списки на пропуска",true,"access",true),
    checklist("access-days","Доступ","В какие дни можно выводить новичков",true,"staffing",true),
    checklist("access-limit","Доступ","Максимум новичков за один вывод",false,"staffing",false),

    checklist("work-duties","Работа","Фактические обязанности по каждой позиции",true,"operations",true),
    checklist("work-location","Работа","Где проходит работа: помещение / улица / смешанно",true,"operations",false),
    checklist("work-load","Работа","Физическая нагрузка и критические требования",true,"operations",false),
    checklist("work-supervisor","Работа","Кто ставит задачи и принимает результат",true,"operations",true),

    checklist("schedule-shift","График","Фактическое время смен",true,"operations",true),
    checklist("schedule-arrival","График","Во сколько сотрудник должен быть на месте",true,"operations",true),
    checklist("schedule-breaks","График","Перерывы и обед",false,"operations",false),
    checklist("schedule-pattern","График","Допустимые графики 5/2, 6/1, вахта и т. п.",true,"staffing",false),

    checklist("housing-required","Проживание","Требуется ли проживание сотрудникам",true,"housing",false),
    checklist("housing-options","Проживание","Есть ли жильё заказчика или рекомендованные варианты",false,"housing",false),
    checklist("transport-required","Транспорт","Нужна ли развозка",true,"transport",false),
    checklist("transport-points","Транспорт","Точки посадки / место остановки автобуса",false,"transport",false),
    checklist("meals","Питание","Как организовано питание и режим столовой",false,"meals",false),

    checklist("ppe-client","СИЗ и форма","Что выдаёт заказчик",true,"supply",false),
    checklist("ppe-company","СИЗ и форма","Что должна предоставить наша компания",true,"supply",true),
    checklist("ppe-first-day","СИЗ и форма","Можно ли первый день выйти в своей одежде",false,"supply",false),
    checklist("ppe-issue","СИЗ и форма","Где и кто выдаёт СИЗ / форму",false,"supply",false),

    checklist("time-confirm","Учёт времени","Кто подтверждает выход сотрудника",true,"operations",true),
    checklist("time-source","Учёт времени","Источник факта: турникет / табель / мастер",true,"operations",true),
    checklist("time-deadline","Учёт времени","Когда заказчик передаёт / подтверждает табель",true,"operations",false),
    checklist("time-overtime","Учёт времени","Кто подтверждает переработки и замены",false,"operations",false),

    checklist("staff-plan","Потребность","Плановая численность по позициям и сменам",true,"staffing",true),
    checklist("staff-minimum","Потребность","Минимальный состав для первого запуска",true,"staffing",true),
    checklist("staff-priority","Потребность","Какие позиции / смены закрывать в первую очередь",true,"staffing",false),
    checklist("staff-restrictions","Потребность","Ограничения: опыт, допуски, гражданство и другие требования",true,"staffing",false),

    checklist("contacts-night","Контакты","Контакт дневной и ночной смены",true,"operations",true),
    checklist("contacts-escalation","Контакты","Кому эскалировать проблемы запуска",true,"operations",true),
  ];
}

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
      return {id:`demo-launch-${index+1}`,organizationId:actor.organizationId,objectId,object:object.name,clientId:object.clientId,client:object.client,regionId:object.regionId,ownerUserId:object.ownerUserId??null,ownerName,assigneeUserIds:object.assigneeUserIds??[],targetDate:target,forecastDate:target,phase:progress>=100?"completed":"preparation",progress,risk:object.risk??"normal",stabilizationDays:7};
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<LaunchPlanRow[]>`
      SELECT l.id,l.organization_id "organizationId",l.object_id "objectId",o.name object,o.client_company_id "clientId",c.name client,
        o.region_id "regionId",o.owner_user_id "ownerUserId",u.display_name "ownerName",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
        l.target_date::text "targetDate",l.forecast_date::text "forecastDate",l.phase,l.progress_pct::int progress,l.risk_level risk,l.stabilization_days "stabilizationDays"
      FROM launches l JOIN objects o ON o.id=l.object_id JOIN client_companies c ON c.id=o.client_company_id
      LEFT JOIN app_users u ON u.id=o.owner_user_id
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
        {id:plan.id+"-wave-1",organizationId:actor.organizationId,launchId:plan.id,objectId:plan.objectId,name:"Первая волна",targetDate:addDays(plan.targetDate,-7),plannedCount:first,specialtyId:null,specialty:null,note:"Базовый план, можно изменить",status:"planned" as const},
        {id:plan.id+"-wave-2",organizationId:actor.organizationId,launchId:plan.id,objectId:plan.objectId,name:"Полный состав",targetDate:plan.targetDate,plannedCount:Math.max(total-first,1),specialtyId:null,specialty:null,note:null,status:"planned" as const},
      ];
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<LaunchStaffingWaveRow & {ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[]}>>`
      SELECT w.id,w.organization_id "organizationId",w.launch_id "launchId",l.object_id "objectId",w.name,w.target_date::text "targetDate",
        w.planned_count "plannedCount",w.specialty_id "specialtyId",s.name specialty,w.note,w.status,
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
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}
