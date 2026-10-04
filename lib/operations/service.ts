import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { companyProfile as demoCompanyProfile, organizationUnits as demoOrganizationUnits } from "@/lib/demo/organization";

export type OperationsAnalyticsRow = {
  organizationId:string;
  objectId:string;
  object:string;
  code:string;
  client:string;
  region:string;
  manager:string|null;
  ownerUserId:string|null;
  assigneeUserIds:string[];
  required:number;
  working:number;
  preparing:number;
  deficit:number;
  todayDemand:number;
  todayAssigned:number;
  noShows:number;
  monthHours:number;
  openIncidents:number;
};

export type OperationsReferenceData = {
  objects:Array<{id:string;name:string;region:string|null;ownerUserId:string|null;ownerName:string|null;assigneeUserIds:string[]}>;
  specialties:Array<{id:string;name:string}>;
  workers:Array<{id:string;fullName:string;objectId:string|null;object:string|null;specialtyId:string|null;specialty:string|null}>;
};

export type StorageLocationRow = {
  id:string;
  organizationId:string;
  name:string;
  kind:string;
  objectId:string|null;
  object:string|null;
  responsibleUserId:string|null;
  responsible:string|null;
  ownerUserId:string|null;
  assigneeUserIds:string[];
  description:string|null;
};

export type InventoryVariantRow = {
  id:string;
  itemId:string;
  code:string|null;
  label:string;
  sortOrder:number;
  active:boolean;
};

export type InventoryPriceRow = {
  id:string;
  itemId:string;
  variantId:string|null;
  unitCost:number;
  effectiveFrom:string;
  effectiveTo:string|null;
  source:string;
  partnerId:string|null;
  partner:string|null;
};

export type InventoryItemRow = {
  id:string;
  name:string;
  code:string|null;
  category:string;
  unit:string;
  returnable:boolean;
  tracksVariant:boolean;
  sizeMode:"none"|"clothing"|"shoe"|"manual";
  defaultReplacementCycleDays:number|null;
  notes:string|null;
  currentPrice:number|null;
  currentPriceId:string|null;
  currentPriceEffectiveFrom:string|null;
};

export type InventoryBalanceRow = {
  itemId:string;
  item:string;
  code:string|null;
  category:string;
  unit:string;
  returnable:boolean;
  tracksVariant:boolean;
  variant:string;
  variantId:string|null;
  locationId:string;
  location:string;
  locationKind:string;
  objectId:string|null;
  ownerUserId:string|null;
  assigneeUserIds:string[];
  quantity:number;
  usableQuantity:number;
  newQuantity:number;
  goodQuantity:number;
  serviceQuantity:number;
  repairQuantity:number;
  unusableQuantity:number;
  minQuantity:number;
};

export type InventorySnapshot = {
  locations:StorageLocationRow[];
  items:InventoryItemRow[];
  variants:InventoryVariantRow[];
  prices:InventoryPriceRow[];
  balances:InventoryBalanceRow[];
};

export type ObjectPpeTemplateItemRow={itemId:string;item:string;quantity:number;unit:string;sizeSource:"none"|"clothing"|"shoe"|"manual";variant:string;replacementCycleDays:number|null;unitCost:number|null;priceId:string|null;priceEffectiveFrom:string|null};
export type ObjectPpeTemplateRow={id:string;objectId:string|null;specialtyId:string;specialty:string;name:string;source:"global"|"object";items:ObjectPpeTemplateItemRow[]};

function demoSupplyTemplate(specialtyId:string,specialty:string):ObjectPpeTemplateRow{
  return {id:`demo-ppe-global-${specialtyId}`,objectId:null,specialtyId,specialty,name:"Базовая норма",source:"global",items:[
    {itemId:"demo-item-jacket",item:"Куртка рабочая",quantity:1,unit:"шт",sizeSource:"clothing",variant:"",replacementCycleDays:180,unitCost:4200,priceId:"demo-price-jacket",priceEffectiveFrom:"2026-09-01"},
    {itemId:"demo-item-boots",item:"Ботинки рабочие",quantity:1,unit:"пар",sizeSource:"shoe",variant:"",replacementCycleDays:180,unitCost:3200,priceId:"demo-price-boots",priceEffectiveFrom:"2026-09-01"},
    {itemId:"demo-item-helmet",item:"Каска",quantity:1,unit:"шт",sizeSource:"none",variant:"",replacementCycleDays:365,unitCost:900,priceId:"demo-price-helmet",priceEffectiveFrom:"2026-09-01"},
    {itemId:"demo-item-gloves",item:"Перчатки рабочие",quantity:1,unit:"пар",sizeSource:"none",variant:"",replacementCycleDays:7,unitCost:120,priceId:"demo-price-gloves",priceEffectiveFrom:"2026-09-01"},
  ]};
}
function demoSpecialtyOptions(actor:Actor){
  const visibleObjects=demo.objects.filter(row=>canReadRow(actor.access,"assets.read",row,actor));
  const objectIds=new Set(visibleObjects.map(row=>row.id));
  const names=[...new Set(demo.needs.filter(row=>objectIds.has(row.objectId)).map(row=>row.specialty))];
  return names.map((name,index)=>({id:`demo-specialty-${index+1}`,name}));
}
export async function listGlobalPpeTemplates(actor:Actor):Promise<ObjectPpeTemplateRow[]>{
  requireCapability(actor,"assets.read");
  if(actor.demo)return demoSpecialtyOptions(actor).map(item=>demoSupplyTemplate(item.id,item.name));
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<ObjectPpeTemplateRow[]>`
    SELECT t.id,t.object_id "objectId",t.specialty_id "specialtyId",s.name specialty,t.name,'global'::text source,
      COALESCE(jsonb_agg(jsonb_build_object(
        'itemId',i.id,'item',i.name,'quantity',ti.quantity,'unit',i.unit,'sizeSource',ti.size_source,'variant',ti.variant,
        'replacementCycleDays',COALESCE(ti.replacement_cycle_days,i.default_replacement_cycle_days),
        'unitCost',(SELECT p.unit_cost::numeric FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1),
        'priceId',(SELECT p.id FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1),
        'priceEffectiveFrom',(SELECT p.effective_from::text FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1)
      ) ORDER BY i.name) FILTER (WHERE ti.id IS NOT NULL),'[]'::jsonb) items
    FROM object_ppe_templates t
    JOIN specialties s ON s.id=t.specialty_id
    LEFT JOIN object_ppe_template_items ti ON ti.template_id=t.id
    LEFT JOIN inventory_items i ON i.id=ti.item_id
    WHERE t.object_id IS NULL AND t.active
    GROUP BY t.id,s.name ORDER BY s.name
  `);
}
export async function listObjectPpeTemplates(actor:Actor,objectId:string):Promise<ObjectPpeTemplateRow[]>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const object=demo.objects.find(row=>row.id===objectId&&canReadRow(actor.access,"assets.read",row,actor));if(!object)return[];
    const names=new Set([
      ...demo.workers.filter(w=>w.objectId===objectId).map(w=>w.specialty).filter((value):value is string=>Boolean(value)),
      ...demo.needs.filter(n=>n.objectId===objectId).map(n=>n.specialty).filter(Boolean),
    ]);
    return demoSpecialtyOptions(actor).filter(item=>names.has(item.name)).map(item=>demoSupplyTemplate(item.id,item.name));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds" FROM objects o WHERE o.id=${objectId}::uuid`;
    if(!scope||!canReadRow(actor.access,"assets.read",scope,actor))return[];
    return sql<ObjectPpeTemplateRow[]>`
      WITH ranked AS (
        SELECT t.*,row_number() OVER (
          PARTITION BY t.specialty_id
          ORDER BY (t.object_id=${objectId}::uuid) DESC NULLS LAST,t.updated_at DESC,t.created_at DESC
        ) rn
        FROM object_ppe_templates t
        WHERE t.active AND (t.object_id=${objectId}::uuid OR t.object_id IS NULL)
      )
      SELECT t.id,t.object_id "objectId",t.specialty_id "specialtyId",s.name specialty,t.name,
        CASE WHEN t.object_id IS NULL THEN 'global' ELSE 'object' END source,
        COALESCE(jsonb_agg(jsonb_build_object(
        'itemId',i.id,'item',i.name,'quantity',ti.quantity,'unit',i.unit,'sizeSource',ti.size_source,'variant',ti.variant,
        'replacementCycleDays',COALESCE(ti.replacement_cycle_days,i.default_replacement_cycle_days),
        'unitCost',(SELECT p.unit_cost::numeric FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1),
        'priceId',(SELECT p.id FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1),
        'priceEffectiveFrom',(SELECT p.effective_from::text FROM inventory_item_prices p WHERE p.item_id=i.id AND p.variant_id IS NULL AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date) ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1)
      ) ORDER BY i.name) FILTER (WHERE ti.id IS NOT NULL),'[]'::jsonb) items
      FROM ranked t
      JOIN specialties s ON s.id=t.specialty_id
      LEFT JOIN object_ppe_template_items ti ON ti.template_id=t.id
      LEFT JOIN inventory_items i ON i.id=ti.item_id
      WHERE t.rn=1
      GROUP BY t.id,t.object_id,t.specialty_id,s.name,t.name
      ORDER BY s.name
    `;
  });
}

export type CrewRow = {
  id:string;
  organizationId:string;
  objectId:string;
  object:string;
  specialtyId:string|null;
  specialty:string|null;
  name:string;
  leaderWorkerId:string|null;
  leader:string|null;
  leaderMode:"working_leader"|"dedicated";
  bonusAmount:number|null;
  bonusUnit:string|null;
  memberCount:number;
  status:string;
  ownerUserId:string|null;
  assigneeUserIds:string[];
};

export async function listOperationsAnalytics(actor:Actor):Promise<OperationsAnalyticsRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    return demo.objects
      .filter(row=>canReadRow(actor.access,"operations.object.read",row,actor))
      .map(row=>{
        const today=new Date().toISOString().slice(0,10);
        const objectWorkers=demo.workers.filter(worker=>worker.objectId===row.id&&worker.status==="active");
        const activeAbsence=(worker:(typeof demo.workers)[number])=>worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today);
        const isDayOff=(worker:(typeof demo.workers)[number])=>{const index=demo.workers.findIndex(item=>item.id===worker.id);return !activeAbsence(worker)&&index%7===3};
        const isNoShow=(worker:(typeof demo.workers)[number])=>{const index=demo.workers.findIndex(item=>item.id===worker.id);return !activeAbsence(worker)&&!isDayOff(worker)&&index%13===7};
        const workers=objectWorkers.length;
        const todayDemand=objectWorkers.filter(worker=>!activeAbsence(worker)&&!isDayOff(worker)).length;
        const noShows=objectWorkers.filter(isNoShow).length;
        const incidents=demo.incidents.filter(item=>item.objectId===row.id&&item.status!=="resolved").length;
        const preparing=demo.candidates.filter(candidate=>candidate.objectId===row.id&&["documents","clearance","preparation","first_shift"].includes(candidate.stage)).length;
        return {
          organizationId:row.organizationId,
          objectId:row.id,
          object:row.name,
          code:row.code,
          client:row.client,
          region:row.region,
          manager:row.ownerName??null,
          ownerUserId:row.ownerUserId??null,
          assigneeUserIds:row.assigneeUserIds??[],
          required:Number(row.required??0),
          working:workers,
          preparing,
          deficit:Math.max(Number(row.required??0)-workers,0),
          todayDemand,
          todayAssigned:todayDemand,
          noShows,
          monthHours:demo.timesheet.objectId===row.id?Number(demo.timesheet.internalHours??0):0,
          openIncidents:incidents,
        };
      });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<OperationsAnalyticsRow[]>`
      SELECT
        o.organization_id "organizationId",o.id "objectId",o.name object,o.code,c.name client,rg.name region,
        owner.display_name manager,o.owner_user_id "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
        COALESCE(needs.required,0)::int required,
        COALESCE(workforce.working,0)::int working,
        COALESCE(preparing.count,0)::int preparing,
        GREATEST(COALESCE(needs.required,0)-COALESCE(workforce.working,0),0)::int deficit,
        COALESCE(today."demand",0)::int "todayDemand",
        COALESCE(today.assigned,0)::int "todayAssigned",
        COALESCE(no_shows.count,0)::int "noShows",
        COALESCE(hours.total,0)::numeric "monthHours",
        COALESCE(open_incidents.count,0)::int "openIncidents"
      FROM objects o
      JOIN client_companies c ON c.id=o.client_company_id
      JOIN regions rg ON rg.id=o.region_id
      LEFT JOIN app_users owner ON owner.id=o.owner_user_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(n.count_required),0)::int required
        FROM needs n WHERE n.object_id=o.id AND n.source_kind<>'replacement' AND n.status NOT IN ('cancelled','archived','closed')
      ) needs ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT woa.worker_id)::int working
        FROM worker_object_assignments woa
        JOIN worker_profiles wp ON wp.id=woa.worker_id AND wp.status='active'
        WHERE woa.object_id=o.id
          AND woa.effective_from<=current_date
          AND (woa.effective_to IS NULL OR woa.effective_to>=current_date)
      ) workforce ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int count
        FROM candidate_applications ca
        WHERE ca.object_id=o.id
          AND ca.stage IN ('documents','clearance','preparation','first_shift')
          AND ca.actual_start_at IS NULL
      ) preparing ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(sh.demand_count),0)::int "demand",
          COALESCE(sum((SELECT count(*) FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled')),0)::int assigned
        FROM shifts sh WHERE sh.object_id=o.id AND sh.shift_date=current_date
      ) today ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT a.worker_id)::int count
        FROM worker_object_assignments a
        JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=o.id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
          AND NOT EXISTS (
            SELECT 1 FROM worker_absence_plans ap
            WHERE ap.worker_id=a.worker_id AND ap.object_id=o.id AND ap.status='confirmed'
              AND ap.planned_from<=current_date AND (ap.planned_to IS NULL OR ap.planned_to>=current_date)
          )
          AND (
            EXISTS (SELECT 1 FROM time_entries te WHERE te.worker_id=a.worker_id AND te.object_id=o.id AND te.work_date=current_date AND te.time_code='NO_SHOW')
            OR EXISTS (
              SELECT 1 FROM shift_assignments sa
              JOIN shifts sh ON sh.id=sa.shift_id
              WHERE sa.worker_id=a.worker_id AND sh.object_id=o.id AND sh.shift_date=current_date AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'
                AND (SELECT ae.event_type FROM attendance_events ae WHERE ae.shift_assignment_id=sa.id ORDER BY ae.event_at DESC LIMIT 1)='no_show'
            )
          )
      ) no_shows ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(te.fact_hours),0)::numeric total
        FROM time_entries te
        WHERE te.object_id=o.id
          AND te.work_date>=date_trunc('month',current_date)::date
          AND te.work_date<(date_trunc('month',current_date)+interval '1 month')::date
      ) hours ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int count FROM incidents i WHERE i.object_id=o.id AND i.status<>'resolved'
      ) open_incidents ON true
      ORDER BY o.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}



export type OperationsAnalyticsSummary = {
  weeklyNoShows:Array<{label:string;value:number}>;
  timesheetStatuses:Array<{status:string;count:number}>;
  launches:{total:number;onTime:number;late:number;inProgress:number};
  incidents30d:number;
};

export async function getOperationsAnalyticsSummary(actor:Actor):Promise<OperationsAnalyticsSummary>{
  requireCapability(actor,"operations.object.read");
  const visible=await listOperationsAnalytics(actor);
  const ids=visible.map(row=>row.objectId);
  if(actor.demo){
    return {
      weeklyNoShows:["18.08","25.08","01.09","08.09","15.09","22.09"].map(label=>({label,value:0})),
      timesheetStatuses:[{status:"draft",count:1},{status:"submitted",count:0},{status:"approved",count:0},{status:"returned",count:0}],
      launches:{total:new Set(demo.launchTasks.map(row=>row.objectId)).size,onTime:0,late:0,inProgress:new Set(demo.launchTasks.map(row=>row.objectId)).size},
      incidents30d:demo.incidents.filter(row=>row.status!=="resolved").length,
    };
  }
  if(!ids.length)return {weeklyNoShows:[],timesheetStatuses:[],launches:{total:0,onTime:0,late:0,inProgress:0},incidents30d:0};
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const weeklyNoShows=await sql<Array<{label:string;value:number}>>`
      WITH weeks AS (
        SELECT generate_series(date_trunc('week',current_date)-interval '5 weeks',date_trunc('week',current_date),interval '1 week')::date week_start
      )
      SELECT to_char(w.week_start,'DD.MM') label,count(ae.id)::int value
      FROM weeks w
      LEFT JOIN shifts sh ON sh.object_id=ANY(${ids}::uuid[]) AND sh.shift_date>=w.week_start AND sh.shift_date<w.week_start+7
      LEFT JOIN shift_assignments sa ON sa.shift_id=sh.id
      LEFT JOIN attendance_events ae ON ae.shift_assignment_id=sa.id AND ae.event_type='no_show'
      GROUP BY w.week_start ORDER BY w.week_start
    `;
    const timesheetStatuses=await sql<Array<{status:string;count:number}>>`
      WITH latest AS (
        SELECT DISTINCT ON (ts.object_id) ts.object_id,ts.status
        FROM timesheet_snapshots ts
        WHERE ts.object_id=ANY(${ids}::uuid[])
          AND ts.view_type='client'
          AND ts.period_start>=date_trunc('month',current_date)::date
        ORDER BY ts.object_id,ts.created_at DESC
      )
      SELECT status,count(*)::int count FROM latest GROUP BY status
    `;
    const [launches]=await sql<Array<{total:number;onTime:number;late:number;inProgress:number}>>`
      SELECT count(*)::int total,
        count(*) FILTER (WHERE COALESCE(forecast_date,target_date)<=target_date AND progress_pct>=100)::int "onTime",
        count(*) FILTER (WHERE COALESCE(forecast_date,target_date)>target_date)::int late,
        count(*) FILTER (WHERE progress_pct<100)::int "inProgress"
      FROM launches WHERE object_id=ANY(${ids}::uuid[])
    `;
    const [incidents]=await sql<Array<{count:number}>>`
      SELECT count(*)::int count FROM incidents
      WHERE object_id=ANY(${ids}::uuid[]) AND occurred_at>=now()-interval '30 days'
    `;
    return {weeklyNoShows,timesheetStatuses,launches:launches??{total:0,onTime:0,late:0,inProgress:0},incidents30d:incidents?.count??0};
  });
}

export async function getOperationsReferenceData(
  actor:Actor,
  capability="worker.read",
  options:{includeWorkers?:boolean;includeSpecialties?:boolean}={},
):Promise<OperationsReferenceData>{
  requireCapability(actor,capability);
  const includeWorkers=options.includeWorkers!==false;
  const includeSpecialties=options.includeSpecialties!==false;
  if(actor.demo){
    const visibleObjects=demo.objects.filter(row=>canReadRow(actor.access,capability,row,actor));
    const objectIds=new Set(visibleObjects.map(row=>row.id));
    const specialtyNames=includeSpecialties?[...new Set(demo.needs.filter(row=>objectIds.has(row.objectId)).map(row=>row.specialty))]:[];
    return {
      objects:visibleObjects.map(row=>({id:row.id,name:row.name,region:row.region,ownerUserId:row.ownerUserId??null,ownerName:row.ownerName??null,assigneeUserIds:row.assigneeUserIds??[]})),
      specialties:specialtyNames.map((name,index)=>({id:`demo-specialty-${index+1}`,name})),
      workers:includeWorkers?demo.workers.filter(row=>row.objectId&&objectIds.has(row.objectId)).map(row=>({id:row.id,fullName:row.fullName,objectId:row.objectId??null,object:row.object??null,specialtyId:null,specialty:null})):[],
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const objects=await sql<Array<{id:string;name:string;region:string|null;regionId:string|null;ownerUserId:string|null;ownerName:string|null;assigneeUserIds:string[]}>>`
      SELECT o.id,o.name,rg.name region,o.region_id "regionId",o.owner_user_id "ownerUserId",owner.display_name "ownerName",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o LEFT JOIN regions rg ON rg.id=o.region_id LEFT JOIN app_users owner ON owner.id=o.owner_user_id ORDER BY o.name
    `;
    const visibleObjects=objects
      .filter(row=>canReadRow(actor.access,capability,{organizationId:actor.organizationId,objectId:row.id,regionId:row.regionId??undefined,ownerUserId:row.ownerUserId,assigneeUserIds:row.assigneeUserIds},actor))
      .map(({regionId:_,...row})=>row);
    const ids=visibleObjects.map(row=>row.id);
    const specialties=includeSpecialties?await sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`:[];
    const workers=includeWorkers&&ids.length
      ? await sql<Array<{id:string;fullName:string;objectId:string|null;object:string|null;specialtyId:string|null;specialty:string|null}>>`
          SELECT w.id,w.full_name "fullName",a.object_id "objectId",o.name object,a.specialty_id "specialtyId",s.name specialty
          FROM worker_profiles w
          JOIN LATERAL (
            SELECT * FROM worker_object_assignments woa
            WHERE woa.worker_id=w.id AND woa.effective_from<=current_date
              AND (woa.effective_to IS NULL OR woa.effective_to>=current_date)
            ORDER BY woa.effective_from DESC LIMIT 1
          ) a ON true
          JOIN objects o ON o.id=a.object_id
          LEFT JOIN specialties s ON s.id=a.specialty_id
          WHERE a.object_id=ANY(${ids}::uuid[])
          ORDER BY w.full_name
        `
      : [];
    return {objects:visibleObjects,specialties,workers};
  });
}

export async function listStorageLocations(actor:Actor):Promise<StorageLocationRow[]>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const object=demo.objects.find(row=>canReadRow(actor.access,"operations.object.read",row,actor))??demo.objects[0];
    return [
      {id:"demo-location-manager",organizationId:object.organizationId,name:"Запас менеджера",kind:"manager",objectId:null,object:null,responsibleUserId:actor.userId,responsible:actor.displayName,ownerUserId:actor.userId,assigneeUserIds:[actor.userId],description:"Личный операционный запас менеджера"},
      {id:"demo-location-object",organizationId:object.organizationId,name:`${object.name} · запас`,kind:"object",objectId:object.id,object:object.name,responsibleUserId:object.ownerUserId??null,responsible:null,ownerUserId:object.ownerUserId??null,assigneeUserIds:object.assigneeUserIds??[],description:"Запас непосредственно на объекте"},
      {id:"demo-location-office",organizationId:object.organizationId,name:"Центральный склад компании",kind:"office",objectId:null,object:null,responsibleUserId:null,responsible:null,ownerUserId:null,assigneeUserIds:[],description:"Общий запас компании, доступный для просмотра менеджерам"},
    ];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<StorageLocationRow[]>`
      SELECT l.id,l.organization_id "organizationId",l.name,l.kind,l.object_id "objectId",o.name object,
        l.responsible_user_id "responsibleUserId",u.display_name responsible,
        COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds",
        l.description
      FROM storage_locations l
      LEFT JOIN objects o ON o.id=l.object_id
      LEFT JOIN app_users u ON u.id=l.responsible_user_id
      WHERE l.active
      ORDER BY l.name
    `;
    return rows.filter(row=>row.kind==="office"||canReadRow(actor.access,"assets.read",row,actor));
  });
}

export async function getInventorySnapshot(actor:Actor):Promise<InventorySnapshot>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const locations=await listStorageLocations(actor);
    const items:InventoryItemRow[]=[
      {id:"demo-item-boots",name:"Ботинки рабочие",code:"BOOT",category:"workwear",unit:"пар",returnable:true,tracksVariant:true,sizeMode:"shoe",defaultReplacementCycleDays:180,notes:null,currentPrice:3200,currentPriceId:"demo-price-boots",currentPriceEffectiveFrom:"2026-09-01"},
      {id:"demo-item-jacket",name:"Куртка рабочая",code:"JACKET",category:"workwear",unit:"шт",returnable:true,tracksVariant:true,sizeMode:"clothing",defaultReplacementCycleDays:180,notes:null,currentPrice:4200,currentPriceId:"demo-price-jacket",currentPriceEffectiveFrom:"2026-09-01"},
      {id:"demo-item-helmet",name:"Каска",code:"HELMET",category:"ppe",unit:"шт",returnable:true,tracksVariant:false,sizeMode:"none",defaultReplacementCycleDays:365,notes:null,currentPrice:900,currentPriceId:"demo-price-helmet",currentPriceEffectiveFrom:"2026-09-01"},
      {id:"demo-item-gloves",name:"Перчатки рабочие",code:"GLOVES",category:"consumable",unit:"пар",returnable:false,tracksVariant:false,sizeMode:"none",defaultReplacementCycleDays:7,notes:null,currentPrice:120,currentPriceId:"demo-price-gloves",currentPriceEffectiveFrom:"2026-09-01"},
    ];
    const variants:InventoryVariantRow[]=[
      {id:"demo-variant-boots-43",itemId:items[0].id,code:"43",label:"43",sortOrder:43,active:true},
      {id:"demo-variant-boots-44",itemId:items[0].id,code:"44",label:"44",sortOrder:44,active:true},
      {id:"demo-variant-jacket-52",itemId:items[1].id,code:"52",label:"52",sortOrder:52,active:true},
      {id:"demo-variant-jacket-54",itemId:items[1].id,code:"54",label:"54",sortOrder:54,active:true},
    ];
    const prices:InventoryPriceRow[]=items.map(item=>({id:item.currentPriceId!,itemId:item.id,variantId:null,unitCost:item.currentPrice!,effectiveFrom:item.currentPriceEffectiveFrom!,effectiveTo:null,source:"manual",partnerId:null,partner:null}));
    const balances:InventoryBalanceRow[]=[
      {...items[0],itemId:items[0].id,item:items[0].name,variant:"43",variantId:variants[0].id,locationId:locations[0].id,location:locations[0].name,locationKind:locations[0].kind,objectId:locations[0].objectId,ownerUserId:locations[0].ownerUserId,assigneeUserIds:locations[0].assigneeUserIds,quantity:3,usableQuantity:3,newQuantity:2,goodQuantity:1,serviceQuantity:0,repairQuantity:0,unusableQuantity:0,minQuantity:2},
      {...items[1],itemId:items[1].id,item:items[1].name,variant:"52",variantId:variants[2].id,locationId:locations[1].id,location:locations[1].name,locationKind:locations[1].kind,objectId:locations[1].objectId,ownerUserId:locations[1].ownerUserId,assigneeUserIds:locations[1].assigneeUserIds,quantity:4,usableQuantity:3,newQuantity:2,goodQuantity:1,serviceQuantity:1,repairQuantity:0,unusableQuantity:0,minQuantity:3},
      {...items[2],itemId:items[2].id,item:items[2].name,variant:"",variantId:null,locationId:locations[1].id,location:locations[1].name,locationKind:locations[1].kind,objectId:locations[1].objectId,ownerUserId:locations[1].ownerUserId,assigneeUserIds:locations[1].assigneeUserIds,quantity:6,usableQuantity:5,newQuantity:3,goodQuantity:2,serviceQuantity:0,repairQuantity:1,unusableQuantity:0,minQuantity:5},
      {...items[3],itemId:items[3].id,item:items[3].name,variant:"",variantId:null,locationId:locations[1].id,location:locations[1].name,locationKind:locations[1].kind,objectId:locations[1].objectId,ownerUserId:locations[1].ownerUserId,assigneeUserIds:locations[1].assigneeUserIds,quantity:80,usableQuantity:80,newQuantity:80,goodQuantity:0,serviceQuantity:0,repairQuantity:0,unusableQuantity:0,minQuantity:100},
    ];
    return {locations,items,variants,prices,balances};
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [locations,items,variants,prices,rawBalances]=await Promise.all([
      listStorageLocations(actor),
      sql<InventoryItemRow[]>`
        SELECT i.id,i.name,i.code,i.category,i.unit,i.returnable,i.tracks_variant "tracksVariant",
          i.size_mode "sizeMode",i.default_replacement_cycle_days "defaultReplacementCycleDays",i.notes,
          current_price.unit_cost::numeric "currentPrice",current_price.id "currentPriceId",current_price.effective_from::text "currentPriceEffectiveFrom"
        FROM inventory_items i
        LEFT JOIN LATERAL (
          SELECT p.id,p.unit_cost,p.effective_from
          FROM inventory_item_prices p
          WHERE p.item_id=i.id AND p.variant_id IS NULL
            AND p.effective_from<=current_date AND (p.effective_to IS NULL OR p.effective_to>=current_date)
          ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1
        ) current_price ON true
        WHERE i.active ORDER BY i.name
      `,
      sql<InventoryVariantRow[]>`
        SELECT id,item_id "itemId",code,label,sort_order "sortOrder",active
        FROM inventory_item_variants WHERE active
        ORDER BY item_id,sort_order,label
      `,
      sql<InventoryPriceRow[]>`
        SELECT p.id,p.item_id "itemId",p.variant_id "variantId",p.unit_cost::numeric "unitCost",
          p.effective_from::text "effectiveFrom",p.effective_to::text "effectiveTo",p.source,p.partner_id "partnerId",sp.name partner
        FROM inventory_item_prices p
        LEFT JOIN supply_partners sp ON sp.id=p.partner_id
        ORDER BY p.effective_from DESC,p.created_at DESC
      `,
      sql<Array<InventoryBalanceRow & {organizationId:string}>>`
        WITH deltas AS (
          SELECT m.organization_id,m.item_id,m.variant,m.variant_id,m.to_location_id location_id,
            COALESCE(m.target_condition,m.item_condition,CASE WHEN m.movement_type IN ('opening','receipt') THEN 'new' ELSE 'good' END) condition,
            m.quantity delta
          FROM inventory_movements m
          WHERE m.to_location_id IS NOT NULL AND m.movement_type IN ('opening','receipt','transfer','return','adjustment_in')
          UNION ALL
          SELECT m.organization_id,m.item_id,m.variant,m.variant_id,m.from_location_id location_id,
            COALESCE(m.source_condition,m.item_condition,'good') condition,-m.quantity delta
          FROM inventory_movements m
          WHERE m.from_location_id IS NOT NULL AND m.movement_type IN ('transfer','issue','writeoff','adjustment_out')
        ), condition_balances AS (
          SELECT organization_id,item_id,variant,variant_id,location_id,condition,sum(delta)::numeric quantity
          FROM deltas GROUP BY organization_id,item_id,variant,variant_id,location_id,condition
        ), balances AS (
          SELECT organization_id,item_id,variant,max(variant_id::text)::uuid variant_id,location_id,
            sum(quantity)::numeric quantity,
            sum(quantity) FILTER (WHERE condition='new')::numeric "newQuantity",
            sum(quantity) FILTER (WHERE condition='good')::numeric "goodQuantity",
            sum(quantity) FILTER (WHERE condition='worn')::numeric "serviceQuantity",
            sum(quantity) FILTER (WHERE condition='damaged')::numeric "repairQuantity",
            sum(quantity) FILTER (WHERE condition='unusable')::numeric "unusableQuantity"
          FROM condition_balances
          GROUP BY organization_id,item_id,variant,location_id
        ), keys AS (
          SELECT organization_id,item_id,variant,location_id FROM balances
          UNION
          SELECT organization_id,item_id,variant,location_id FROM inventory_stock_limits
        )
        SELECT i.id "itemId",i.name item,i.code,i.category,i.unit,i.returnable,i.tracks_variant "tracksVariant",
          k.variant,b.variant_id "variantId",l.id "locationId",l.name location,l.kind "locationKind",l.object_id "objectId",
          COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds",
          COALESCE(b.quantity,0)::numeric quantity,
          (COALESCE(b."newQuantity",0)+COALESCE(b."goodQuantity",0))::numeric "usableQuantity",
          COALESCE(b."newQuantity",0)::numeric "newQuantity",COALESCE(b."goodQuantity",0)::numeric "goodQuantity",
          COALESCE(b."serviceQuantity",0)::numeric "serviceQuantity",COALESCE(b."repairQuantity",0)::numeric "repairQuantity",
          COALESCE(b."unusableQuantity",0)::numeric "unusableQuantity",
          COALESCE(lim.min_quantity,0)::numeric "minQuantity",k.organization_id "organizationId"
        FROM keys k
        JOIN inventory_items i ON i.id=k.item_id
        JOIN storage_locations l ON l.id=k.location_id
        LEFT JOIN objects o ON o.id=l.object_id
        LEFT JOIN balances b ON b.organization_id=k.organization_id AND b.item_id=k.item_id AND b.location_id=k.location_id AND b.variant=k.variant
        LEFT JOIN inventory_stock_limits lim ON lim.location_id=k.location_id AND lim.item_id=k.item_id AND lim.variant=k.variant
        WHERE l.active AND i.active
        ORDER BY i.name,k.variant,l.name
      `
    ]);
    const visibleLocationIds=new Set(locations.map(row=>row.id));
    const balances=rawBalances
      .filter(row=>visibleLocationIds.has(row.locationId))
      .map(({organizationId:_,...row})=>({
        ...row,
        quantity:Number(row.quantity),usableQuantity:Number(row.usableQuantity),newQuantity:Number(row.newQuantity),goodQuantity:Number(row.goodQuantity),
        serviceQuantity:Number(row.serviceQuantity),repairQuantity:Number(row.repairQuantity),unusableQuantity:Number(row.unusableQuantity),minQuantity:Number(row.minQuantity),
      }));
    return {
      locations,
      items:items.map(row=>({...row,currentPrice:row.currentPrice==null?null:Number(row.currentPrice)})),
      variants,
      prices:prices.map(row=>({...row,unitCost:Number(row.unitCost)})),
      balances,
    };
  });
}

export async function listCrews(actor:Actor):Promise<CrewRow[]>{
  requireCapability(actor,"operations.crew.read");
  if(actor.demo){
    const object=demo.objects.find(row=>canReadRow(actor.access,"operations.object.read",row,actor))??demo.objects[0];
    const leader=demo.workers.find(row=>row.objectId===object.id);
    return leader?[{
      id:"demo-crew-1",organizationId:object.organizationId,objectId:object.id,object:object.name,
      specialtyId:null,specialty:leader.object??null,name:"Бригада 1",leaderWorkerId:leader.id,leader:leader.fullName,
      leaderMode:"working_leader",bonusAmount:1000,bonusUnit:"shift",memberCount:Math.min(5,demo.workers.filter(row=>row.objectId===object.id).length),
      status:"active",ownerUserId:object.ownerUserId??null,assigneeUserIds:object.assigneeUserIds??[],
    }]:[];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CrewRow[]>`
      SELECT cr.id,cr.organization_id "organizationId",cr.object_id "objectId",o.name object,
        cr.specialty_id "specialtyId",s.name specialty,cr.name,cr.leader_worker_id "leaderWorkerId",w.full_name leader,
        cr.leader_mode "leaderMode",cr.bonus_amount "bonusAmount",cr.bonus_unit "bonusUnit",cr.status,
        o.owner_user_id "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
        count(cm.id) FILTER (WHERE cm.effective_from<=current_date AND (cm.effective_to IS NULL OR cm.effective_to>=current_date))::int "memberCount"
      FROM object_crews cr
      JOIN objects o ON o.id=cr.object_id
      LEFT JOIN specialties s ON s.id=cr.specialty_id
      LEFT JOIN worker_profiles w ON w.id=cr.leader_worker_id
      LEFT JOIN object_crew_members cm ON cm.crew_id=cr.id
      GROUP BY cr.id,o.id,o.name,s.name,w.full_name
      ORDER BY o.name,cr.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.crew.read",row,actor));
  });
}


export type HousingSiteRow = {
  id:string;
  organizationId:string;
  name:string;
  address:string|null;
  vendor:string|null;
  rateModel:"bed_day"|"room_day"|"room_month"|"site_period";
  rateAmount:number;
  objectId:string|null;
  object:string|null;
  responsibleUserId:string|null;
  responsible:string|null;
  ownerUserId:string|null;
  assigneeUserIds:string[];
  capacity:number;
  occupied:number;
  available:number;
  monthlyForecast:number;
};

export type HousingStayRow = {
  id:string;
  organizationId:string;
  workerId:string;
  worker:string;
  objectId:string|null;
  object:string|null;
  siteId:string;
  site:string;
  unitId:string|null;
  unit:string|null;
  bedLabel:string|null;
  checkIn:string;
  checkOut:string|null;
  status:string;
  ownerUserId:string|null;
  assigneeUserIds:string[];
};

export type HousingSnapshot = {sites:HousingSiteRow[];stays:HousingStayRow[]};

export async function getHousingSnapshot(actor:Actor):Promise<HousingSnapshot>{
  requireCapability(actor,"supply.housing.read");
  if(actor.demo){
    const object=demo.objects.find(row=>canReadRow(actor.access,"operations.object.read",row,actor))??demo.objects[0];
    const workers=demo.workers.filter(row=>row.objectId===object.id).slice(0,3);
    const site:HousingSiteRow={
      id:"demo-housing-1",organizationId:object.organizationId,name:"Общежитие рядом с объектом",address:null,vendor:"Демо-поставщик",
      rateModel:"bed_day",rateAmount:700,objectId:object.id,object:object.name,responsibleUserId:object.ownerUserId??null,responsible:null,
      ownerUserId:object.ownerUserId??null,assigneeUserIds:object.assigneeUserIds??[],capacity:6,occupied:workers.length,available:6-workers.length,monthlyForecast:workers.length*700*30,
    };
    return {sites:[site],stays:workers.map((worker,index)=>({id:`demo-stay-${index+1}`,organizationId:object.organizationId,workerId:worker.id,worker:worker.fullName,objectId:object.id,object:object.name,siteId:site.id,site:site.name,unitId:null,unit:"Комната 1",bedLabel:String(index+1),checkIn:"01.09.2026",checkOut:null,status:"active",ownerUserId:object.ownerUserId??null,assigneeUserIds:object.assigneeUserIds??[]}))};
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const siteRows=await sql<Array<HousingSiteRow & {regionId:string|null}>>`
      SELECT hs.id,hs.organization_id "organizationId",hs.name,hs.address_text address,hs.vendor,
        hs.rate_model "rateModel",hs.rate_amount::numeric "rateAmount",hs.primary_object_id "objectId",o.name object,
        hs.responsible_user_id "responsibleUserId",u.display_name responsible,
        COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds",
        COALESCE(units.capacity,0)::int capacity,COALESCE(occupancy.occupied,0)::int occupied,
        GREATEST(COALESCE(units.capacity,0)-COALESCE(occupancy.occupied,0),0)::int available,
        CASE hs.rate_model
          WHEN 'bed_day' THEN COALESCE(occupancy.occupied,0)*hs.rate_amount*30
          WHEN 'room_day' THEN COALESCE(units.active_units,0)*hs.rate_amount*30
          WHEN 'room_month' THEN COALESCE(units.active_units,0)*hs.rate_amount
          ELSE hs.rate_amount
        END::numeric "monthlyForecast"
      FROM housing_sites hs
      LEFT JOIN objects o ON o.id=hs.primary_object_id
      LEFT JOIN app_users u ON u.id=hs.responsible_user_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(hu.capacity),0)::int capacity,count(*) FILTER (WHERE hu.active)::int active_units
        FROM housing_units hu WHERE hu.site_id=hs.id AND hu.active
      ) units ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int occupied FROM housing_stays st
        WHERE st.site_id=hs.id AND st.status='active' AND st.check_in<=current_date AND st.actual_check_out IS NULL
      ) occupancy ON true
      WHERE hs.active
      ORDER BY hs.name
    `;
    const sites=siteRows.filter(row=>canReadRow(actor.access,"supply.housing.read",row,actor)).map(({regionId:_,...row})=>({...row,rateAmount:Number(row.rateAmount),monthlyForecast:Number(row.monthlyForecast)}));
    const siteIds=sites.map(row=>row.id);
    if(!siteIds.length)return {sites,stays:[]};
    const stays=await sql<HousingStayRow[]>`
      SELECT st.id,st.organization_id "organizationId",st.worker_id "workerId",w.full_name worker,
        st.object_id "objectId",o.name object,st.site_id "siteId",hs.name site,st.unit_id "unitId",hu.name unit,st.bed_label "bedLabel",
        to_char(st.check_in,'DD.MM.YYYY') "checkIn",to_char(COALESCE(st.actual_check_out,st.planned_check_out,st.check_out),'DD.MM.YYYY') "checkOut",st.status,
        COALESCE(o.owner_user_id,hs.responsible_user_id) "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=st.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds"
      FROM housing_stays st
      JOIN worker_profiles w ON w.id=st.worker_id
      JOIN housing_sites hs ON hs.id=st.site_id
      LEFT JOIN housing_units hu ON hu.id=st.unit_id
      LEFT JOIN objects o ON o.id=st.object_id
      WHERE st.site_id=ANY(${siteIds}::uuid[])
      ORDER BY st.status='active' DESC,st.check_in DESC,w.full_name
    `;
    return {sites,stays:stays.filter(row=>canReadRow(actor.access,"supply.housing.read",row,actor))};
  });
}


export type WorkerAssignmentHistoryRow={id:string;objectId:string;object:string;specialtyId:string|null;specialty:string|null;effectiveFrom:string;effectiveTo:string|null;manager:string|null;workMode:"local"|"rotation";paidHoursPerShift:number|null;scheduleWorkDays:number|null;scheduleRestDays:number|null;scheduleShiftKind:"day"|"night"|"mixed";scheduleAnchorDate:string|null;transitionDays:number;dailyPaymentShifts:number;dayRate:number|null;nightRate:number|null};
export type WorkerAbsenceRow={id:string;absenceType:string;status:string;plannedFrom:string;plannedTo:string|null;actualFrom:string|null;actualTo:string|null;flexibleReturn:boolean;note:string|null};
export type WorkerOperationsDetails={assignments:WorkerAssignmentHistoryRow[];absences:WorkerAbsenceRow[]};

export async function getWorkerOperationsDetails(actor:Actor,workerId:string):Promise<WorkerOperationsDetails>{
  requireCapability(actor,"worker.read");
  if(actor.demo){
    const {listWorkers}=await import("@/lib/data/service");
    const worker=(await listWorkers(actor)).find(row=>row.id===workerId);
    if(!worker)return {assignments:[],absences:[]};
    const assignmentWorker=worker as typeof worker&{workMode?:string|null;paidHoursPerShift?:number|string|null;absenceType?:string|null;absenceStatus?:string|null;absenceFrom?:string|null;absenceTo?:string|null};
    return {
      assignments:worker.objectId?[{id:"demo-assignment",objectId:worker.objectId,object:worker.object??"Объект",specialtyId:worker.specialtyId??null,specialty:worker.specialty??null,effectiveFrom:worker.startDate?worker.startDate.split("-").reverse().join("."):"—",effectiveTo:null,manager:worker.managerName??null,workMode:assignmentWorker.workMode==="rotation"?"rotation":"local",paidHoursPerShift:assignmentWorker.paidHoursPerShift==null?null:Number(assignmentWorker.paidHoursPerShift),scheduleWorkDays:worker.scheduleWorkDays??null,scheduleRestDays:worker.scheduleRestDays??null,scheduleShiftKind:worker.scheduleShiftKind??"mixed",scheduleAnchorDate:worker.startDate??null,transitionDays:worker.transitionDays??7,dailyPaymentShifts:worker.dailyPaymentShifts??0,dayRate:worker.rateUnit==="hour"?Number(worker.dayRate??worker.rate)||null:worker.rateUnit==="shift"&&Number(worker.paidHoursPerShift)>0?Number(worker.dayRate??worker.rate)/Number(worker.paidHoursPerShift):null,nightRate:worker.rateUnit==="hour"?Number(worker.nightRate??worker.rate)||null:worker.rateUnit==="shift"&&Number(worker.paidHoursPerShift)>0?Number(worker.nightRate??worker.rate)/Number(worker.paidHoursPerShift):null}]:[],
      absences:assignmentWorker.absenceType&&assignmentWorker.absenceFrom?[{
        id:"demo-absence-"+worker.id,absenceType:assignmentWorker.absenceType,status:assignmentWorker.absenceStatus??"tentative",
        plannedFrom:assignmentWorker.absenceFrom.split("-").reverse().join("."),plannedTo:assignmentWorker.absenceTo?assignmentWorker.absenceTo.split("-").reverse().join("."):null,
        actualFrom:null,actualTo:null,flexibleReturn:assignmentWorker.absenceType==="intershift",note:assignmentWorker.absenceType==="intershift"?"Плановая межвахта":null,
      }]:[],
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT w.organization_id "organizationId",a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM worker_profiles w
      LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1) a ON true
      LEFT JOIN objects o ON o.id=a.object_id
      WHERE w.id=${workerId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"worker.read",{...scope,objectId:scope.objectId??undefined,ownerUserId:scope.ownerUserId??undefined,regionId:scope.regionId??undefined},actor))return {assignments:[],absences:[]};
    const [assignments,absences]=await Promise.all([
      sql<WorkerAssignmentHistoryRow[]>`
        SELECT a.id,a.object_id "objectId",o.name object,a.specialty_id "specialtyId",s.name specialty,
          to_char(a.effective_from,'DD.MM.YYYY') "effectiveFrom",to_char(a.effective_to,'DD.MM.YYYY') "effectiveTo",u.display_name manager,
          a.work_mode "workMode",a.paid_hours_per_shift::numeric "paidHoursPerShift",a.schedule_work_days "scheduleWorkDays",a.schedule_rest_days "scheduleRestDays",a.schedule_shift_kind "scheduleShiftKind",a.schedule_anchor_date::text "scheduleAnchorDate",a.transition_days "transitionDays",a.daily_payment_shifts "dailyPaymentShifts",
          CASE WHEN COALESCE(day_rate.unit,any_rate.unit)='hour' THEN COALESCE(day_rate.amount,any_rate.amount)
            WHEN COALESCE(day_rate.unit,any_rate.unit)='shift' AND a.paid_hours_per_shift>0 THEN COALESCE(day_rate.amount,any_rate.amount)/a.paid_hours_per_shift ELSE NULL END::numeric "dayRate",
          CASE WHEN COALESCE(night_rate.unit,any_rate.unit)='hour' THEN COALESCE(night_rate.amount,any_rate.amount)
            WHEN COALESCE(night_rate.unit,any_rate.unit)='shift' AND a.paid_hours_per_shift>0 THEN COALESCE(night_rate.amount,any_rate.amount)/a.paid_hours_per_shift ELSE NULL END::numeric "nightRate"
        FROM worker_object_assignments a JOIN objects o ON o.id=a.object_id
        LEFT JOIN specialties s ON s.id=a.specialty_id LEFT JOIN app_users u ON u.id=a.manager_user_id
        LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=a.worker_id AND r.object_id=a.object_id AND r.day_night='any' AND r.effective_from<=COALESCE(a.effective_to,current_date) AND (r.effective_to IS NULL OR r.effective_to>=a.effective_from) ORDER BY r.effective_from DESC LIMIT 1) any_rate ON true
        LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=a.worker_id AND r.object_id=a.object_id AND r.day_night='day' AND r.effective_from<=COALESCE(a.effective_to,current_date) AND (r.effective_to IS NULL OR r.effective_to>=a.effective_from) ORDER BY r.effective_from DESC LIMIT 1) day_rate ON true
        LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=a.worker_id AND r.object_id=a.object_id AND r.day_night='night' AND r.effective_from<=COALESCE(a.effective_to,current_date) AND (r.effective_to IS NULL OR r.effective_to>=a.effective_from) ORDER BY r.effective_from DESC LIMIT 1) night_rate ON true
        WHERE a.worker_id=${workerId}::uuid ORDER BY a.effective_from DESC
      `,
      sql<WorkerAbsenceRow[]>`
        SELECT id,absence_type "absenceType",status,to_char(planned_from,'DD.MM.YYYY') "plannedFrom",to_char(planned_to,'DD.MM.YYYY') "plannedTo",
          to_char(actual_from,'DD.MM.YYYY') "actualFrom",to_char(actual_to,'DD.MM.YYYY') "actualTo",flexible_return "flexibleReturn",note
        FROM worker_absence_plans WHERE worker_id=${workerId}::uuid ORDER BY planned_from DESC
      `,
    ]);
    return {assignments,absences};
  });
}


export type InternalRequestReferenceData={
  legalEntities:Array<{id:string;name:string;shortName:string|null;primary:boolean}>;
  orgUnits:Array<{id:string;name:string;kind:string}>;
};

export type SupplyRequestRow={
  id:string;
  organizationId:string;
  objectId:string|null;
  object:string|null;
  legalEntityId:string|null;
  legalEntity:string|null;
  orgUnitId:string|null;
  orgUnit:string|null;
  requestType:"purchase"|"payment"|"compensation"|"service";
  categoryCode:string;
  priority:"normal"|"urgent"|"critical";
  urgencyReason:string|null;
  title:string;
  description:string|null;
  itemId:string|null;
  item:string|null;
  locationId:string|null;
  location:string|null;
  quantity:number|null;
  fulfilledQuantity:number|null;
  unit:string|null;
  amount:number|null;
  approvedAmount:number|null;
  actualAmount:number|null;
  vendor:string|null;
  partnerId:string|null;
  partner:string|null;
  sourceName:string|null;
  sourceUrl:string|null;
  neededBy:string|null;
  status:string;
  paymentStatus:"not_required"|"pending"|"paid"|"cancelled";
  paidAt:string|null;
  paymentReference:string|null;
  approvalId:string|null;
  approvalStatus:string|null;
  createdByUserId:string;
  createdBy:string;
  assignedTo:string|null;
  createdAt:string;
  ownerUserId:string|null;
  assigneeUserIds:string[];
};

export async function getInternalRequestReferenceData(actor:Actor):Promise<InternalRequestReferenceData>{
  requireCapability(actor,"procurement.read");
  if(actor.demo){
    const unitIds=new Set(actor.orgUnitIds??[]);
    const allOrg=actor.access.allOrg||actor.access.scopes["procurement.read"]?.some(scope=>scope.type==="all_org");
    return {
      legalEntities:demoCompanyProfile.legalEntities.map(row=>({id:row.id,name:row.name,shortName:row.shortName??null,primary:row.primary})),
      orgUnits:demoOrganizationUnits.filter(row=>allOrg||unitIds.has(row.id)).map(row=>({id:row.id,name:row.name,kind:row.kind})),
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const legalEntities=await sql<Array<{id:string;name:string;shortName:string|null;primary:boolean}>>`
      SELECT id,name,short_name "shortName",is_primary "primary" FROM legal_entities WHERE active ORDER BY is_primary DESC,name
    `;
    const allOrg=actor.access.allOrg||actor.access.scopes["procurement.read"]?.some(scope=>scope.type==="all_org");
    const ids=actor.orgUnitIds??[];
    const orgUnits=allOrg
      ? await sql<Array<{id:string;name:string;kind:string}>>`SELECT id,name,kind FROM organization_units WHERE active ORDER BY sort_order,name`
      : ids.length
        ? await sql<Array<{id:string;name:string;kind:string}>>`SELECT id,name,kind FROM organization_units WHERE active AND id=ANY(${ids}::uuid[]) ORDER BY sort_order,name`
        : [];
    return {legalEntities,orgUnits};
  });
}

export async function listSupplyRequests(actor:Actor):Promise<SupplyRequestRow[]>{
  requireCapability(actor,"procurement.read");
  if(actor.demo){
    const object=demo.objects.find(row=>canReadRow(actor.access,"operations.object.read",row,actor))??demo.objects[0];
    const legalEntity=demoCompanyProfile.legalEntities[0];
    const ownUnit=demoOrganizationUnits.find(row=>actor.orgUnitIds.includes(row.id))??demoOrganizationUnits[0];
    const rows:SupplyRequestRow[]=[
      {
        id:"demo-supply-request-1",organizationId:object.organizationId,objectId:object.id,object:object.name,legalEntityId:legalEntity.id,legalEntity:legalEntity.shortName??legalEntity.name,orgUnitId:"21000000-0000-4000-8000-000000000007",orgUnit:"Обеспечение",
        requestType:"purchase",categoryCode:"workwear_ppe",priority:"urgent",urgencyReason:"Новые сотрудники выходят на объект",title:"Рабочая обувь для новых сотрудников",description:"Нужны размеры 42–44",itemId:"demo-item-boots",item:"Ботинки рабочие",locationId:null,location:null,
        quantity:6,fulfilledQuantity:0,unit:"пар",amount:19200,approvedAmount:19200,actualAmount:null,vendor:null,partnerId:null,partner:null,sourceName:"Ozon",sourceUrl:"https://www.ozon.ru/",neededBy:"06.10.2026",status:"approved",paymentStatus:"pending",paidAt:null,paymentReference:null,approvalId:"demo-approval-supply-1",approvalStatus:"approved",
        createdByUserId:"10000000-0000-4000-8000-000000000004",createdBy:"Дмитрий Орлов",assignedTo:"Ирина Белова",createdAt:"02.10.2026",ownerUserId:"10000000-0000-4000-8000-000000000011",assigneeUserIds:["10000000-0000-4000-8000-000000000004","10000000-0000-4000-8000-000000000011"],
      },
      {
        id:"demo-supply-request-2",organizationId:object.organizationId,objectId:null,object:null,legalEntityId:legalEntity.id,legalEntity:legalEntity.shortName??legalEntity.name,orgUnitId:"21000000-0000-4000-8000-000000000009",orgUnit:"Группа подбора",
        requestType:"payment",categoryCode:"recruiting_advertising",priority:"normal",urgencyReason:null,title:"Пополнение рекламного кабинета Avito",description:"Продвижение вакансий электромонтажников",itemId:null,item:null,locationId:null,location:null,
        quantity:null,fulfilledQuantity:null,unit:null,amount:30000,approvedAmount:30000,actualAmount:null,vendor:"Avito",partnerId:null,partner:null,sourceName:"Avito",sourceUrl:"https://www.avito.ru/",neededBy:"07.10.2026",status:"approved",paymentStatus:"pending",paidAt:null,paymentReference:null,approvalId:"demo-approval-supply-2",approvalStatus:"approved",
        createdByUserId:"10000000-0000-4000-8000-000000000012",createdBy:"Ольга Зайцева",assignedTo:"Елена Котова",createdAt:"03.10.2026",ownerUserId:"10000000-0000-4000-8000-000000000006",assigneeUserIds:["10000000-0000-4000-8000-000000000012","10000000-0000-4000-8000-000000000006"],
      },
      {
        id:"demo-supply-request-3",organizationId:object.organizationId,objectId:object.id,object:object.name,legalEntityId:legalEntity.id,legalEntity:legalEntity.shortName??legalEntity.name,orgUnitId:"21000000-0000-4000-8000-000000000005",orgUnit:"Операции",
        requestType:"service",categoryCode:"housing",priority:"normal",urgencyReason:null,title:"Продлить проживание сотрудников",description:"Общежитие на октябрь, 8 койко-мест",itemId:null,item:null,locationId:null,location:null,
        quantity:8,fulfilledQuantity:8,unit:"мест",amount:64000,approvedAmount:64000,actualAmount:64000,vendor:"Общежитие Север",partnerId:null,partner:"Общежитие Север",sourceName:null,sourceUrl:null,neededBy:"05.10.2026",status:"received",paymentStatus:"paid",paidAt:"03.10.2026",paymentReference:"ПП 418",approvalId:"demo-approval-supply-3",approvalStatus:"approved",
        createdByUserId:"10000000-0000-4000-8000-000000000003",createdBy:"Алексей Громов",assignedTo:"Ирина Белова",createdAt:"28.09.2026",ownerUserId:"10000000-0000-4000-8000-000000000011",assigneeUserIds:["10000000-0000-4000-8000-000000000003","10000000-0000-4000-8000-000000000011"],
      },
    ];
    return rows.filter(row=>canReadRow(actor.access,"procurement.read",row,actor));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<SupplyRequestRow[]>`
      SELECT r.id,r.organization_id "organizationId",r.object_id "objectId",o.name object,
        r.legal_entity_id "legalEntityId",COALESCE(le.short_name,le.name) "legalEntity",
        r.organization_unit_id "orgUnitId",ou.name "orgUnit",r.request_type "requestType",r.category_code "categoryCode",r.priority,r.urgency_reason "urgencyReason",
        r.title,r.description,r.item_id "itemId",i.name item,r.location_id "locationId",l.name location,
        r.quantity::numeric quantity,r.fulfilled_quantity::numeric "fulfilledQuantity",r.unit,r.amount::numeric amount,r.approved_amount::numeric "approvedAmount",r.actual_amount::numeric "actualAmount",
        r.vendor,r.partner_id "partnerId",sp.name partner,r.source_name "sourceName",r.source_url "sourceUrl",to_char(r.needed_by,'DD.MM.YYYY') "neededBy",
        r.status,r.payment_status "paymentStatus",to_char(r.paid_at,'DD.MM.YYYY') "paidAt",r.payment_reference "paymentReference",
        approval.id "approvalId",approval.status "approvalStatus",r.created_by_user_id "createdByUserId",creator.display_name "createdBy",assignee.display_name "assignedTo",to_char(r.created_at,'DD.MM.YYYY') "createdAt",
        COALESCE(r.assigned_to_user_id,o.owner_user_id,r.created_by_user_id) "ownerUserId",
        ARRAY_REMOVE(ARRAY[r.created_by_user_id::text,r.assigned_to_user_id::text,o.owner_user_id::text],NULL) "assigneeUserIds"
      FROM supply_requests r
      LEFT JOIN objects o ON o.id=r.object_id
      LEFT JOIN legal_entities le ON le.id=r.legal_entity_id
      LEFT JOIN organization_units ou ON ou.id=r.organization_unit_id
      LEFT JOIN inventory_items i ON i.id=r.item_id
      LEFT JOIN storage_locations l ON l.id=r.location_id
      LEFT JOIN supply_partners sp ON sp.id=r.partner_id
      JOIN app_users creator ON creator.id=r.created_by_user_id
      LEFT JOIN app_users assignee ON assignee.id=r.assigned_to_user_id
      LEFT JOIN LATERAL (
        SELECT ai.id,ai.status FROM approval_instances ai
        WHERE ai.subject_type='supply_request' AND ai.subject_id=r.id
        ORDER BY ai.submitted_at DESC LIMIT 1
      ) approval ON true
      ORDER BY r.status IN ('closed','rejected'),r.payment_status='pending' DESC,r.needed_by NULLS LAST,r.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"procurement.read",row,actor)).map(row=>({
      ...row,
      quantity:row.quantity==null?null:Number(row.quantity),
      fulfilledQuantity:row.fulfilledQuantity==null?null:Number(row.fulfilledQuantity),
      amount:row.amount==null?null:Number(row.amount),
      approvedAmount:row.approvedAmount==null?null:Number(row.approvedAmount),
      actualAmount:row.actualAmount==null?null:Number(row.actualAmount),
    }));
  });
}

export type WorkerOutstandingAsset={itemId:string;item:string;variant:string;quantity:number;unit:string};
export type WorkerExitHistoryRow={id:string;effectiveDate:string;reasonCode:string;reason:string|null;status:string;createdAt:string;replacementRequired:boolean;returnToRecruiting:boolean;replacementNeedId:string|null;replacementWorkerId:string|null;replacementWorker:string|null};
export type WorkerOffboardingContext={
  relationType:string|null;
  relationFrom:string|null;
  relationTo:string|null;
  outstandingAssets:WorkerOutstandingAsset[];
  housing:Array<{id:string;site:string;checkIn:string;checkOut:string|null;status:string}>;
  exits:WorkerExitHistoryRow[];
};

export async function getWorkerOffboardingContext(actor:Actor,workerId:string):Promise<WorkerOffboardingContext>{
  requireCapability(actor,"worker.read");
  if(actor.demo)return {relationType:"employment",relationFrom:"01.09.2026",relationTo:null,outstandingAssets:[],housing:[],exits:[]};
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT w.organization_id "organizationId",a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM worker_profiles w
      LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1) a ON true
      LEFT JOIN objects o ON o.id=a.object_id
      WHERE w.id=${workerId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"worker.read",{...scope,objectId:scope.objectId??undefined,ownerUserId:scope.ownerUserId??undefined,regionId:scope.regionId??undefined},actor))return {relationType:null,relationFrom:null,relationTo:null,outstandingAssets:[],housing:[],exits:[]};
    const [relation]=await sql<Array<{relationType:string;relationFrom:string;relationTo:string|null}>>`
      SELECT relation_type "relationType",to_char(effective_from,'DD.MM.YYYY') "relationFrom",to_char(effective_to,'DD.MM.YYYY') "relationTo"
      FROM employment_relations WHERE worker_id=${workerId}::uuid ORDER BY effective_from DESC LIMIT 1
    `;
    const assets=hasCapability(actor.access,"assets.read")?await sql<Array<WorkerOutstandingAsset & {quantity:number|string}>>`
      SELECT i.id "itemId",i.name item,m.variant,
        sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                 WHEN m.movement_type='return' THEN -m.quantity
                 WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                 ELSE 0 END)::numeric quantity,
        i.unit
      FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
      WHERE m.worker_id=${workerId}::uuid AND i.returnable
      GROUP BY i.id,i.name,i.unit,m.variant
      HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                      WHEN m.movement_type='return' THEN -m.quantity
                      WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                      ELSE 0 END)>0
      ORDER BY i.name,m.variant
    `:[] as Array<WorkerOutstandingAsset & {quantity:number|string}>;
    const housing=hasCapability(actor.access,"supply.housing.read")?await sql<Array<{id:string;site:string;checkIn:string;checkOut:string|null;status:string}>>`
      SELECT st.id,hs.name site,to_char(st.check_in,'DD.MM.YYYY') "checkIn",to_char(COALESCE(st.actual_check_out,st.planned_check_out,st.check_out),'DD.MM.YYYY') "checkOut",st.status
      FROM housing_stays st JOIN housing_sites hs ON hs.id=st.site_id
      WHERE st.worker_id=${workerId}::uuid AND st.status IN ('planned','active')
      ORDER BY st.check_in DESC
    `:[];
    const exits=await sql<WorkerExitHistoryRow[]>`
      SELECT ep.id,to_char(ep.effective_date,'DD.MM.YYYY') "effectiveDate",ep.reason_code "reasonCode",ep.reason,ep.status,to_char(ep.created_at,'DD.MM.YYYY') "createdAt",
        ep.replacement_required "replacementRequired",ep.return_to_recruiting "returnToRecruiting",ep.replacement_need_id "replacementNeedId",ep.replacement_worker_id "replacementWorkerId",rw.full_name "replacementWorker"
      FROM worker_exit_processes ep LEFT JOIN worker_profiles rw ON rw.id=ep.replacement_worker_id
      WHERE ep.worker_id=${workerId}::uuid ORDER BY ep.effective_date DESC,ep.created_at DESC
    `;
    return {relationType:relation?.relationType??null,relationFrom:relation?.relationFrom??null,relationTo:relation?.relationTo??null,outstandingAssets:assets.map(row=>({...row,quantity:Number(row.quantity)})),housing,exits};
  });
}

export type StaffingForecastRow={
  organizationId:string;objectId:string;object:string;specialtyId:string;specialty:string;needIds:string[];editableNeedId:string|null;
  planTargetIds:string[];planSource:"target"|"legacy_need";openNeedCount:number;openNeedVolume:number;
  required:number;working:number;preparing:number;confirmedStarts:number;confirmedAbsences:number;tentativeAbsences:number;plannedExits:number;replacementNeeds:number;replacementReady:number;
  projectedAvailable:number;projectedDeficit:number;ownerUserId:string|null;assigneeUserIds:string[];regionId:string|null;
};

export async function listStaffingForecast(actor:Actor,horizonDays=30):Promise<StaffingForecastRow[]>{
  requireCapability(actor,"operations.need.read");
  const horizon=Math.max(7,Math.min(90,horizonDays));
  if(actor.demo){
    const today=new Date().toISOString().slice(0,10);
    const horizonDate=new Date(today+"T00:00:00Z");horizonDate.setUTCDate(horizonDate.getUTCDate()+horizon);
    const horizonEnd=horizonDate.toISOString().slice(0,10);
    return demo.needs.map((need,index)=>{
      const object=demo.objects.find(row=>row.id===need.objectId);
      const workers=demo.workers.filter(worker=>worker.objectId===need.objectId&&worker.specialty===need.specialty&&worker.status==="active");
      const working=workers.length;
      const related=demo.candidates.filter(candidate=>candidate.objectId===need.objectId&&candidate.need===need.specialty);
      const preparing=related.filter(candidate=>["documents","clearance","preparation","first_shift"].includes(candidate.stage)).length;
      const confirmedStarts=related.filter(candidate=>candidate.stage==="first_shift").length;
      const absences=workers.filter(worker=>worker.absenceStatus&&worker.absenceFrom&&worker.absenceFrom<=horizonEnd&&(!worker.absenceTo||worker.absenceTo>=horizonEnd));
      const confirmedAbsences=absences.filter(worker=>worker.absenceStatus==="confirmed").length;
      const tentativeAbsences=absences.filter(worker=>worker.absenceStatus==="tentative").length;
      const plannedExits=0;
      const projectedAvailable=Math.max(working-confirmedAbsences-plannedExits+confirmedStarts,0);
      const row:StaffingForecastRow={
        organizationId:object?.organizationId??actor.organizationId,objectId:need.objectId,object:need.object,
        specialtyId:"demo-specialty-"+index,specialty:need.specialty,needIds:[need.id],editableNeedId:need.id,
        planTargetIds:[],planSource:"legacy_need",openNeedCount:1,openNeedVolume:Number(need.required),
        required:Number(need.required),working,preparing,confirmedStarts,confirmedAbsences,tentativeAbsences,plannedExits,
        replacementNeeds:0,replacementReady:0,projectedAvailable,projectedDeficit:Math.max(Number(need.required)-projectedAvailable,0),
        ownerUserId:object?.ownerUserId??null,assigneeUserIds:object?.assigneeUserIds??[],regionId:object?.regionId??null
      };
      return row;
    }).filter(row=>canReadRow(actor.access,"operations.need.read",row,actor));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<StaffingForecastRow[]>`
      WITH ranked_targets AS (
        SELECT t.*,
          row_number() OVER (
            PARTITION BY t.object_id,t.specialty_id,t.shift_kind
            ORDER BY t.effective_from DESC,t.created_at DESC
          ) rn
        FROM staffing_plan_targets t
        WHERE t.effective_from<=current_date+${horizon}::int
          AND (t.effective_to IS NULL OR t.effective_to>=current_date+${horizon}::int)
      ),
      target_demand AS (
        SELECT object_id,specialty_id,sum(planned_count)::int required,
          array_agg(id::text ORDER BY effective_from,created_at) "planTargetIds"
        FROM ranked_targets WHERE rn=1
        GROUP BY object_id,specialty_id
      ),
      legacy_need_demand AS (
        SELECT n.object_id,n.specialty_id,sum(n.count_required)::int required
        FROM needs n
        WHERE n.object_id IS NOT NULL
          AND n.source_kind<>'replacement'
          AND n.status NOT IN ('cancelled','archived','closed')
          AND NOT EXISTS (
            SELECT 1 FROM target_demand td
            WHERE td.object_id=n.object_id AND td.specialty_id=n.specialty_id
          )
        GROUP BY n.object_id,n.specialty_id
      ),
      demand AS (
        SELECT object_id,specialty_id,required,"planTargetIds",'target'::text "planSource"
        FROM target_demand
        UNION ALL
        SELECT object_id,specialty_id,required,ARRAY[]::text[] "planTargetIds",'legacy_need'::text "planSource"
        FROM legacy_need_demand
      ),
      need_context AS (
        SELECT n.object_id,n.specialty_id,
          array_agg(n.id::text ORDER BY n.created_at) need_ids,
          count(*)::int need_count,
          sum(n.count_required)::int need_volume
        FROM needs n
        WHERE n.object_id IS NOT NULL
          AND n.source_kind<>'replacement'
          AND n.status NOT IN ('cancelled','archived','closed')
        GROUP BY n.object_id,n.specialty_id
      )
      SELECT o.organization_id "organizationId",o.id "objectId",o.name object,d.specialty_id "specialtyId",s.name specialty,
        COALESCE(nc.need_ids,ARRAY[]::text[]) "needIds",
        CASE WHEN nc.need_count=1 THEN nc.need_ids[1] ELSE NULL END "editableNeedId",
        d."planTargetIds",d."planSource",
        COALESCE(nc.need_count,0)::int "openNeedCount",COALESCE(nc.need_volume,0)::int "openNeedVolume",
        d.required,
        COALESCE(workforce.working,0)::int working,
        COALESCE(incoming.preparing,0)::int preparing,
        COALESCE(incoming.confirmed,0)::int "confirmedStarts",
        COALESCE(absences.confirmed,0)::int "confirmedAbsences",
        COALESCE(absences.tentative,0)::int "tentativeAbsences",
        COALESCE(exits.planned,0)::int "plannedExits",
        COALESCE(replacements.open_count,0)::int "replacementNeeds",
        COALESCE(replacements.ready_count,0)::int "replacementReady",
        GREATEST(COALESCE(workforce.working,0)-COALESCE(unavailable.count,0)+COALESCE(incoming.confirmed,0),0)::int "projectedAvailable",
        GREATEST(d.required-GREATEST(COALESCE(workforce.working,0)-COALESCE(unavailable.count,0)+COALESCE(incoming.confirmed,0),0),0)::int "projectedDeficit",
        o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM demand d
      JOIN objects o ON o.id=d.object_id
      JOIN specialties s ON s.id=d.specialty_id
      LEFT JOIN need_context nc ON nc.object_id=d.object_id AND nc.specialty_id=d.specialty_id
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT a.worker_id)::int working
        FROM worker_object_assignments a
        JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=o.id AND a.specialty_id=d.specialty_id
          AND a.effective_from<=current_date
          AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      ) workforce ON true
      LEFT JOIN LATERAL (
        SELECT
          count(DISTINCT ca.candidate_id) FILTER (
            WHERE ca.stage IN ('documents','clearance','preparation','ready','first_shift','started')
              AND ca.actual_start_at IS NULL
              AND (
                ca.stage IN ('preparation','ready','first_shift','started')
                OR ca.planned_start_date<=current_date+${horizon}::int
              )
          )::int preparing,
          count(DISTINCT ca.candidate_id) FILTER (
            WHERE ca.stage IN ('first_shift','started')
              AND ca.actual_start_at IS NULL
              AND ca.planned_start_date IS NOT NULL
              AND ca.planned_start_date BETWEEN current_date AND current_date+${horizon}::int
          )::int confirmed
        FROM candidate_applications ca
        JOIN needs cn ON cn.id=ca.need_id
        WHERE ca.object_id=o.id AND cn.specialty_id=d.specialty_id
      ) incoming ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT CASE WHEN ap.status='confirmed' THEN ap.worker_id END)::int confirmed,
               count(DISTINCT CASE WHEN ap.status='tentative' THEN ap.worker_id END)::int tentative
        FROM worker_absence_plans ap
        JOIN worker_object_assignments a ON a.worker_id=ap.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
        WHERE ap.status IN ('confirmed','tentative')
          AND a.effective_from<=current_date+${horizon}::int
          AND (a.effective_to IS NULL OR a.effective_to>=current_date+${horizon}::int)
          AND ap.planned_from<=current_date+${horizon}::int
          AND (ap.planned_to IS NULL OR ap.planned_to>=current_date+${horizon}::int)
      ) absences ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT ep.worker_id)::int planned
        FROM worker_exit_processes ep
        JOIN worker_object_assignments a ON a.worker_id=ep.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
        WHERE ep.status='planned'
          AND a.effective_from<=ep.effective_date
          AND (a.effective_to IS NULL OR a.effective_to>=ep.effective_date)
          AND ep.effective_date BETWEEN current_date AND current_date+${horizon}::int
      ) exits ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE n.status NOT IN ('filled','cancelled','archived'))::int open_count,
               count(*) FILTER (WHERE n.status='filled' OR ep.replacement_worker_id IS NOT NULL)::int ready_count
        FROM needs n
        LEFT JOIN worker_exit_processes ep ON ep.id=n.replacement_exit_id
        WHERE n.object_id=o.id AND n.specialty_id=d.specialty_id AND n.source_kind='replacement'
      ) replacements ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT x.worker_id)::int count
        FROM (
          SELECT ap.worker_id
          FROM worker_absence_plans ap
          JOIN worker_object_assignments a ON a.worker_id=ap.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
          WHERE ap.status='confirmed'
            AND a.effective_from<=current_date+${horizon}::int
            AND (a.effective_to IS NULL OR a.effective_to>=current_date+${horizon}::int)
            AND ap.planned_from<=current_date+${horizon}::int
            AND (ap.planned_to IS NULL OR ap.planned_to>=current_date+${horizon}::int)
          UNION
          SELECT ep.worker_id
          FROM worker_exit_processes ep
          JOIN worker_object_assignments a ON a.worker_id=ep.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
          WHERE ep.status='planned'
            AND a.effective_from<=ep.effective_date
            AND (a.effective_to IS NULL OR a.effective_to>=ep.effective_date)
            AND ep.effective_date BETWEEN current_date AND current_date+${horizon}::int
        ) x
      ) unavailable ON true
      ORDER BY "projectedDeficit" DESC,o.name,s.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.need.read",row,actor));
  });
}

export type ObjectContactRow={
  assignmentId:string;contactId:string;fullName:string;position:string|null;phone:string|null;email:string|null;
  telegram:string|null;whatsapp:string|null;maxContact:string|null;preferredChannel:string|null;roles:string[];note:string|null;
};
export type ClientContactOption={
  id:string;fullName:string;position:string|null;phone:string|null;email:string|null;telegram:string|null;whatsapp:string|null;maxContact:string|null;preferredChannel:string|null;
};
export async function getObjectContacts(actor:Actor,objectId:string):Promise<{assigned:ObjectContactRow[];contacts:ClientContactOption[]}>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const object=demo.objects.find(row=>row.id===objectId&&canReadRow(actor.access,"operations.object.read",row,actor));
    if(!object)return {assigned:[],contacts:[]};
    const contacts:ClientContactOption[]=demo.clientContacts.filter(contact=>contact.clientId===object.clientId);
    const assigned:ObjectContactRow[]=demo.objectContactAssignments.filter(link=>link.objectId===objectId).flatMap(link=>{
      const contact=contacts.find(item=>item.id===link.contactId);if(!contact)return[];
      return [{assignmentId:link.id,contactId:contact.id,fullName:contact.fullName,position:contact.position,phone:contact.phone,email:contact.email,telegram:contact.telegram,whatsapp:contact.whatsapp,maxContact:contact.maxContact,preferredChannel:contact.preferredChannel,roles:link.roles,note:link.note}];
    });
    return {contacts,assigned};
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string;clientId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.client_company_id "clientId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.id=${objectId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"operations.object.read",scope,actor))return {assigned:[],contacts:[]};
    const [assigned,contacts]=await Promise.all([
      sql<ObjectContactRow[]>`
        SELECT a.id "assignmentId",c.id "contactId",c.full_name "fullName",c.position,c.phone,c.email,c.telegram,c.whatsapp,c.max_contact "maxContact",
          c.communication_preference "preferredChannel",a.roles,a.note
        FROM object_contact_assignments a JOIN contacts c ON c.id=a.contact_id
        WHERE a.object_id=${objectId}::uuid AND a.active
        ORDER BY c.full_name
      `,
      sql<ClientContactOption[]>`
        SELECT c.id,c.full_name "fullName",c.position,c.phone,c.email,c.telegram,c.whatsapp,c.max_contact "maxContact",c.communication_preference "preferredChannel"
        FROM contacts c WHERE c.client_company_id=${scope.clientId}::uuid ORDER BY c.full_name
      `,
    ]);
    return {assigned,contacts};
  });
}

export type ObjectDocumentRow={
  id:string;organizationId:string;objectId:string;name:string;category:string;documentNumber:string|null;sourceUrl:string|null;status:string;
  documentDate:string|null;versionLabel:string|null;validFrom:string|null;expiresAt:string|null;notes:string|null;createdAt:string;createdBy:string;updatedAt:string;
  ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
};
export async function listObjectDocuments(actor:Actor,objectId:string):Promise<ObjectDocumentRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const object=demo.objects.find(row=>row.id===objectId&&canReadRow(actor.access,"operations.object.read",row,actor));
    if(!object)return[];
    const base={organizationId:object.organizationId,objectId,ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[],documentNumber:null,documentDate:"2026-09-25",versionLabel:"1.0",validFrom:null,expiresAt:null,createdAt:"25.09.2026",createdBy:"Анна Лебедева",updatedAt:"25.09.2026"};
    return [
      {...base,id:`doc-${objectId}-1`,name:"Инструкция по пропускному режиму",category:"access",sourceUrl:null,status:"active",notes:"Рабочая инструкция заказчика"},
      {...base,id:`doc-${objectId}-2`,name:"Требования к СИЗ",category:"ppe",sourceUrl:null,status:"active",notes:"Комплект и требования по объекту"},
      {...base,id:`doc-${objectId}-3`,name:"Инструкция по охране труда",category:"safety",sourceUrl:null,status:"needs_update",notes:"Проверить актуальность версии"},
    ];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<ObjectDocumentRow[]>`
      SELECT d.id,d.organization_id "organizationId",d.object_id "objectId",d.name,d.category,d.document_number "documentNumber",d.source_url "sourceUrl",d.status,
        d.document_date::text "documentDate",d.version_label "versionLabel",d.valid_from::text "validFrom",d.expires_at::text "expiresAt",d.notes,
        to_char(d.created_at,'DD.MM.YYYY') "createdAt",creator.display_name "createdBy",to_char(d.updated_at,'DD.MM.YYYY') "updatedAt",
        o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM object_documents d JOIN objects o ON o.id=d.object_id
      JOIN app_users creator ON creator.id=d.created_by_user_id
      WHERE d.object_id=${objectId}::uuid
      ORDER BY d.status='archived',d.expires_at NULLS LAST,d.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}

export type DailyPaymentShift={workDate:string;hours:number;dayHours:number;nightHours:number;paymentId:string|null;paymentStatus:string|null;paymentAmount:number|null;paymentDate:string|null;suggestedAmount:number};
export type DailyPaymentProgressRow={
  organizationId:string;objectId:string;workerId:string;worker:string;specialty:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
  shiftLimit:number;assignmentStart:string;workedCount:number;remaining:number;rate:number|null;rateUnit:string|null;paidHoursPerShift:number|null;shifts:DailyPaymentShift[];
};
export async function listDailyPaymentProgress(actor:Actor,objectId:string):Promise<DailyPaymentProgressRow[]>{
  requireCapability(actor,"finance.payments.read");
  if(actor.demo){
    const object=demo.objects.find(row=>row.id===objectId&&canReadRow(actor.access,"finance.payments.read",row,actor));
    if(!object)return[];
    const workers=demo.workers.filter(row=>row.objectId===objectId&&row.status==="active");
    const today=new Date();
    return workers.flatMap((worker,index)=>{
      const shiftLimit=index<4?3:0;
      const paidHours=Number((worker as {paidHoursPerShift?:number|string|null}).paidHoursPerShift??11);
      const rate=Number(worker.rate??0);const rateUnit=(worker as {rateUnit?:string|null}).rateUnit??"hour";
      const suggested=rateUnit==="shift"?rate:rate*paidHours;
      const shifts:DailyPaymentShift[]=Array.from({length:Math.min(shiftLimit,Math.max(1,3-index%2))},(_,i)=>{const d=new Date(today);d.setUTCDate(d.getUTCDate()-(3-i));const workDate=d.toISOString().slice(0,10);const paid=i<1+index%2;return {workDate,hours:paidHours,dayHours:index%3===1?0:paidHours,nightHours:index%3===1?paidHours:0,paymentId:paid?`demo-daily-${index}-${i}`:null,paymentStatus:paid?"paid":null,paymentAmount:paid?suggested:null,paymentDate:paid?workDate:null,suggestedAmount:suggested};});
      return [{organizationId:object.organizationId,objectId,workerId:worker.id,worker:worker.fullName,specialty:worker.specialty??null,ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[],shiftLimit,assignmentStart:worker.startDate??today.toISOString().slice(0,10),workedCount:shifts.length,remaining:Math.max(shiftLimit-shifts.length,0),rate,rateUnit,paidHoursPerShift:paidHours,shifts}];
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.id=${objectId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"finance.payments.read",scope,actor))return[];
    const rows=await sql<Array<{
      workerId:string;worker:string;specialty:string|null;shiftLimit:number;assignmentStart:string;rate:number|string|null;rateUnit:string|null;paidHoursPerShift:number|string|null;
      shifts:Array<{workDate:string;hours:number|string;dayHours:number|string;nightHours:number|string;dayRate:number|string|null;nightRate:number|string|null;paymentId:string|null;paymentStatus:string|null;paymentAmount:number|string|null;paymentDate:string|null}>;
    }>>`
      SELECT w.id "workerId",w.full_name worker,s.name specialty,a.daily_payment_shifts "shiftLimit",a.effective_from::text "assignmentStart",
        wr.amount rate,wr.unit "rateUnit",a.paid_hours_per_shift "paidHoursPerShift",
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'workDate',x.work_date::text,'hours',x.hours,'dayHours',x.day_hours,'nightHours',x.night_hours,
            'dayRate',COALESCE((SELECT r.amount FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=a.object_id AND r.day_night='day' AND r.effective_from<=x.work_date AND (r.effective_to IS NULL OR r.effective_to>=x.work_date) ORDER BY r.effective_from DESC LIMIT 1),(SELECT r.amount FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=a.object_id AND r.day_night='any' AND r.effective_from<=x.work_date AND (r.effective_to IS NULL OR r.effective_to>=x.work_date) ORDER BY r.effective_from DESC LIMIT 1)),
            'nightRate',COALESCE((SELECT r.amount FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=a.object_id AND r.day_night='night' AND r.effective_from<=x.work_date AND (r.effective_to IS NULL OR r.effective_to>=x.work_date) ORDER BY r.effective_from DESC LIMIT 1),(SELECT r.amount FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=a.object_id AND r.day_night='any' AND r.effective_from<=x.work_date AND (r.effective_to IS NULL OR r.effective_to>=x.work_date) ORDER BY r.effective_from DESC LIMIT 1)),
            'paymentId',ap.id,'paymentStatus',ap.status,'paymentAmount',ap.amount,'paymentDate',ap.payment_date::text
          ) ORDER BY x.work_date)
          FROM (
            SELECT te.work_date,sum(te.fact_hours)::numeric hours,sum(te.day_hours)::numeric day_hours,sum(te.night_hours)::numeric night_hours
            FROM time_entries te
            WHERE te.worker_id=w.id AND te.object_id=a.object_id AND te.work_date>=a.effective_from AND te.fact_hours>0
            GROUP BY te.work_date ORDER BY te.work_date LIMIT a.daily_payment_shifts
          ) x
          LEFT JOIN advance_payments ap ON ap.worker_id=w.id AND ap.object_id=a.object_id AND ap.payment_purpose='daily_shift' AND ap.work_date=x.work_date
        ),'[]'::jsonb) shifts
      FROM worker_object_assignments a
      JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
      LEFT JOIN specialties s ON s.id=a.specialty_id
      LEFT JOIN LATERAL (
        SELECT amount,unit FROM worker_rates r WHERE r.worker_id=w.id AND r.effective_from<=current_date AND (r.effective_to IS NULL OR r.effective_to>=current_date)
        ORDER BY r.effective_from DESC LIMIT 1
      ) wr ON true
      WHERE a.object_id=${objectId}::uuid AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date) ORDER BY w.full_name
    `;
    return rows.map(row=>{
      const rate=row.rate==null?null:Number(row.rate);const paidHours=row.paidHoursPerShift==null?null:Number(row.paidHoursPerShift);
      const shifts=(row.shifts??[]).map(item=>{const hours=Number(item.hours??0),dayHours=Number(item.dayHours??0),nightHours=Number(item.nightHours??0);const dayRate=item.dayRate==null?rate:Number(item.dayRate),nightRate=item.nightRate==null?rate:Number(item.nightRate);const suggested=row.rateUnit==="shift"&&rate!=null?rate:(dayHours*Number(dayRate??0)+nightHours*Number(nightRate??0));return {workDate:item.workDate,hours,dayHours,nightHours,paymentId:item.paymentId,paymentStatus:item.paymentStatus,paymentAmount:item.paymentAmount==null?null:Number(item.paymentAmount),paymentDate:item.paymentDate,suggestedAmount:suggested};});
      return {...scope,workerId:row.workerId,worker:row.worker,specialty:row.specialty,shiftLimit:Number(row.shiftLimit),assignmentStart:row.assignmentStart,workedCount:shifts.length,remaining:Math.max(Number(row.shiftLimit)-shifts.length,0),rate,rateUnit:row.rateUnit,paidHoursPerShift:paidHours,shifts};
    });
  });
}