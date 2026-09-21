import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

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
  objects:Array<{id:string;name:string;region:string|null;ownerUserId:string|null;assigneeUserIds:string[]}>;
  specialties:Array<{id:string;name:string}>;
  workers:Array<{id:string;fullName:string;objectId:string|null;object:string|null}>;
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

export type InventoryItemRow = {
  id:string;
  name:string;
  code:string|null;
  category:string;
  unit:string;
  returnable:boolean;
  tracksVariant:boolean;
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
  locationId:string;
  location:string;
  locationKind:string;
  objectId:string|null;
  ownerUserId:string|null;
  assigneeUserIds:string[];
  quantity:number;
  minQuantity:number;
};

export type InventorySnapshot = {
  locations:StorageLocationRow[];
  items:InventoryItemRow[];
  balances:InventoryBalanceRow[];
};

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
        const workers=demo.workers.filter(worker=>worker.objectId===row.id&&worker.status==="active").length;
        const shifts=demo.shifts.filter(shift=>shift.objectId===row.id);
        const incidents=demo.incidents.filter(item=>item.objectId===row.id&&item.status!=="resolved").length;
        const preparing=demo.candidates.filter(candidate=>candidate.objectId===row.id&&["documents","clearance","preparation","first_shift"].includes(candidate.stage)).length;
        return {
          organizationId:row.organizationId,
          objectId:row.id,
          object:row.name,
          code:row.code,
          client:row.client,
          region:row.region,
          manager:null,
          ownerUserId:row.ownerUserId??null,
          assigneeUserIds:row.assigneeUserIds??[],
          required:Number(row.required??0),
          working:workers,
          preparing,
          deficit:Math.max(Number(row.required??0)-workers,0),
          todayDemand:shifts.reduce((sum,shift)=>sum+Number(shift.demand??0),0),
          todayAssigned:shifts.reduce((sum,shift)=>sum+Number(shift.assigned??0),0),
          noShows:0,
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
        FROM needs n WHERE n.object_id=o.id AND n.status NOT IN ('cancelled','archived')
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
        SELECT COALESCE(sum(sh.demand_count),0)::int "demand",COALESCE(sum(sh.assigned_count),0)::int assigned
        FROM shifts sh WHERE sh.object_id=o.id AND sh.shift_date=current_date
      ) today ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int count
        FROM attendance_events ae
        JOIN shift_assignments sa ON sa.id=ae.shift_assignment_id
        JOIN shifts sh ON sh.id=sa.shift_id
        WHERE sh.object_id=o.id AND sh.shift_date=current_date AND ae.event_type='no_show'
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
      objects:visibleObjects.map(row=>({id:row.id,name:row.name,region:row.region,ownerUserId:row.ownerUserId??null,assigneeUserIds:row.assigneeUserIds??[]})),
      specialties:specialtyNames.map((name,index)=>({id:`demo-specialty-${index+1}`,name})),
      workers:includeWorkers?demo.workers.filter(row=>row.objectId&&objectIds.has(row.objectId)).map(row=>({id:row.id,fullName:row.fullName,objectId:row.objectId??null,object:row.object??null})):[],
    };
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const objects=await sql<Array<{id:string;name:string;region:string|null;regionId:string|null;ownerUserId:string|null;assigneeUserIds:string[]}>>`
      SELECT o.id,o.name,rg.name region,o.region_id "regionId",o.owner_user_id "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o LEFT JOIN regions rg ON rg.id=o.region_id ORDER BY o.name
    `;
    const visibleObjects=objects
      .filter(row=>canReadRow(actor.access,capability,{organizationId:actor.organizationId,objectId:row.id,regionId:row.regionId??undefined,ownerUserId:row.ownerUserId,assigneeUserIds:row.assigneeUserIds},actor))
      .map(({regionId:_,...row})=>row);
    const ids=visibleObjects.map(row=>row.id);
    const specialties=includeSpecialties?await sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`:[];
    const workers=includeWorkers&&ids.length
      ? await sql<Array<{id:string;fullName:string;objectId:string|null;object:string|null}>>`
          SELECT w.id,w.full_name "fullName",a.object_id "objectId",o.name object
          FROM worker_profiles w
          JOIN LATERAL (
            SELECT * FROM worker_object_assignments woa
            WHERE woa.worker_id=w.id AND woa.effective_from<=current_date
              AND (woa.effective_to IS NULL OR woa.effective_to>=current_date)
            ORDER BY woa.effective_from DESC LIMIT 1
          ) a ON true
          JOIN objects o ON o.id=a.object_id
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
    return rows.filter(row=>canReadRow(actor.access,"assets.read",row,actor));
  });
}

export async function getInventorySnapshot(actor:Actor):Promise<InventorySnapshot>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const locations=await listStorageLocations(actor);
    const items:InventoryItemRow[]=[
      {id:"demo-item-boots",name:"Ботинки рабочие",code:"BOOT",category:"workwear",unit:"пар",returnable:true,tracksVariant:true},
      {id:"demo-item-jacket",name:"Куртка рабочая",code:"JACKET",category:"workwear",unit:"шт",returnable:true,tracksVariant:true},
      {id:"demo-item-helmet",name:"Каска",code:"HELMET",category:"ppe",unit:"шт",returnable:true,tracksVariant:false},
    ];
    const balances:InventoryBalanceRow[]=[
      {...items[0],itemId:items[0].id,item:items[0].name,variant:"43",locationId:locations[0].id,location:locations[0].name,locationKind:locations[0].kind,objectId:locations[0].objectId,ownerUserId:locations[0].ownerUserId,assigneeUserIds:locations[0].assigneeUserIds,quantity:3,minQuantity:2},
      {...items[1],itemId:items[1].id,item:items[1].name,variant:"52",locationId:locations[1].id,location:locations[1].name,locationKind:locations[1].kind,objectId:locations[1].objectId,ownerUserId:locations[1].ownerUserId,assigneeUserIds:locations[1].assigneeUserIds,quantity:4,minQuantity:3},
      {...items[2],itemId:items[2].id,item:items[2].name,variant:"",locationId:locations[1].id,location:locations[1].name,locationKind:locations[1].kind,objectId:locations[1].objectId,ownerUserId:locations[1].ownerUserId,assigneeUserIds:locations[1].assigneeUserIds,quantity:6,minQuantity:5},
    ];
    return {locations,items,balances};
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [locations,items,rawBalances]=await Promise.all([
      listStorageLocations(actor),
      sql<InventoryItemRow[]>`
        SELECT id,name,code,category,unit,returnable,tracks_variant "tracksVariant"
        FROM inventory_items WHERE active ORDER BY name
      `,
      sql<Array<InventoryBalanceRow & {organizationId:string}>>`
        WITH deltas AS (
          SELECT m.organization_id,m.item_id,m.variant,m.to_location_id location_id,m.quantity delta
          FROM inventory_movements m
          WHERE m.to_location_id IS NOT NULL AND m.movement_type IN ('opening','receipt','transfer','return','adjustment_in')
          UNION ALL
          SELECT m.organization_id,m.item_id,m.variant,m.from_location_id location_id,-m.quantity delta
          FROM inventory_movements m
          WHERE m.from_location_id IS NOT NULL AND m.movement_type IN ('transfer','issue','writeoff','adjustment_out')
        ), balances AS (
          SELECT organization_id,item_id,variant,location_id,sum(delta)::numeric quantity
          FROM deltas GROUP BY organization_id,item_id,variant,location_id
        ), keys AS (
          SELECT organization_id,item_id,variant,location_id FROM balances
          UNION
          SELECT organization_id,item_id,variant,location_id FROM inventory_stock_limits
        )
        SELECT i.id "itemId",i.name item,i.code,i.category,i.unit,i.returnable,i.tracks_variant "tracksVariant",
          k.variant,l.id "locationId",l.name location,l.kind "locationKind",l.object_id "objectId",
          COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds",
          COALESCE(b.quantity,0)::numeric quantity,COALESCE(lim.min_quantity,0)::numeric "minQuantity",k.organization_id "organizationId"
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
      .filter(row=>visibleLocationIds.has(row.locationId)&&canReadRow(actor.access,"assets.read",row,actor))
      .map(({organizationId:_,...row})=>({...row,quantity:Number(row.quantity),minQuantity:Number(row.minQuantity)}));
    return {locations,items,balances};
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
        WHERE st.site_id=hs.id AND st.status='active' AND st.check_in<=current_date AND (st.check_out IS NULL OR st.check_out>=current_date)
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
        to_char(st.check_in,'DD.MM.YYYY') "checkIn",to_char(st.check_out,'DD.MM.YYYY') "checkOut",st.status,
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


export type WorkerAssignmentHistoryRow={id:string;objectId:string;object:string;specialtyId:string|null;specialty:string|null;effectiveFrom:string;effectiveTo:string|null;manager:string|null};
export type WorkerAbsenceRow={id:string;absenceType:string;status:string;plannedFrom:string;plannedTo:string|null;actualFrom:string|null;actualTo:string|null;flexibleReturn:boolean;note:string|null};
export type WorkerOperationsDetails={assignments:WorkerAssignmentHistoryRow[];absences:WorkerAbsenceRow[]};

export async function getWorkerOperationsDetails(actor:Actor,workerId:string):Promise<WorkerOperationsDetails>{
  requireCapability(actor,"worker.read");
  if(actor.demo){
    const worker=demo.workers.find(row=>row.id===workerId);
    if(!worker)return {assignments:[],absences:[]};
    return {
      assignments:worker.objectId?[{id:"demo-assignment",objectId:worker.objectId,object:worker.object??"Объект",specialtyId:null,specialty:null,effectiveFrom:"01.09.2026",effectiveTo:null,manager:null}]:[],
      absences:[],
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
          to_char(a.effective_from,'DD.MM.YYYY') "effectiveFrom",to_char(a.effective_to,'DD.MM.YYYY') "effectiveTo",u.display_name manager
        FROM worker_object_assignments a JOIN objects o ON o.id=a.object_id
        LEFT JOIN specialties s ON s.id=a.specialty_id LEFT JOIN app_users u ON u.id=a.manager_user_id
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


export type SupplyRequestRow={
  id:string;
  organizationId:string;
  objectId:string|null;
  object:string|null;
  requestType:"purchase"|"payment"|"compensation"|"service";
  title:string;
  description:string|null;
  itemId:string|null;
  item:string|null;
  locationId:string|null;
  location:string|null;
  quantity:number|null;
  unit:string|null;
  amount:number|null;
  vendor:string|null;
  neededBy:string|null;
  status:string;
  approvalId:string|null;
  approvalStatus:string|null;
  createdBy:string;
  assignedTo:string|null;
  createdAt:string;
  ownerUserId:string|null;
  assigneeUserIds:string[];
};

export async function listSupplyRequests(actor:Actor):Promise<SupplyRequestRow[]>{
  requireCapability(actor,"procurement.read");
  if(actor.demo){
    const object=demo.objects.find(row=>canReadRow(actor.access,"operations.object.read",row,actor))??demo.objects[0];
    return [{
      id:"demo-supply-request-1",organizationId:object.organizationId,objectId:object.id,object:object.name,requestType:"purchase",
      title:"Пополнить рабочую обувь",description:"Дефицит размера 43",itemId:"demo-item-boots",item:"Ботинки рабочие",locationId:null,location:null,
      quantity:6,unit:"пар",amount:null,vendor:null,neededBy:"25.09.2026",status:"submitted",approvalId:null,approvalStatus:null,createdBy:actor.displayName,assignedTo:null,createdAt:"20.09.2026",
      ownerUserId:object.ownerUserId??null,assigneeUserIds:object.assigneeUserIds??[],
    }];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<SupplyRequestRow[]>`
      SELECT r.id,r.organization_id "organizationId",r.object_id "objectId",o.name object,r.request_type "requestType",
        r.title,r.description,r.item_id "itemId",i.name item,r.location_id "locationId",l.name location,
        r.quantity::numeric quantity,r.unit,r.amount::numeric amount,r.vendor,to_char(r.needed_by,'DD.MM.YYYY') "neededBy",
        r.status,approval.id "approvalId",approval.status "approvalStatus",creator.display_name "createdBy",assignee.display_name "assignedTo",to_char(r.created_at,'DD.MM.YYYY') "createdAt",
        COALESCE(o.owner_user_id,r.created_by_user_id) "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=r.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || ARRAY[r.created_by_user_id::text] "assigneeUserIds"
      FROM supply_requests r
      LEFT JOIN objects o ON o.id=r.object_id LEFT JOIN inventory_items i ON i.id=r.item_id
      LEFT JOIN storage_locations l ON l.id=r.location_id
      JOIN app_users creator ON creator.id=r.created_by_user_id
      LEFT JOIN app_users assignee ON assignee.id=r.assigned_to_user_id
      LEFT JOIN LATERAL (
        SELECT ai.id,ai.status FROM approval_instances ai
        WHERE ai.subject_type='supply_request' AND ai.subject_id=r.id
        ORDER BY ai.submitted_at DESC LIMIT 1
      ) approval ON true
      ORDER BY r.status IN ('closed','rejected'),r.needed_by NULLS LAST,r.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"procurement.read",row,actor)).map(row=>({...row,quantity:row.quantity==null?null:Number(row.quantity),amount:row.amount==null?null:Number(row.amount)}));
  });
}


export type WorkerOutstandingAsset={itemId:string;item:string;variant:string;quantity:number;unit:string};
export type WorkerExitHistoryRow={id:string;effectiveDate:string;reasonCode:string;reason:string|null;status:string;createdAt:string};
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
      SELECT st.id,hs.name site,to_char(st.check_in,'DD.MM.YYYY') "checkIn",to_char(st.check_out,'DD.MM.YYYY') "checkOut",st.status
      FROM housing_stays st JOIN housing_sites hs ON hs.id=st.site_id
      WHERE st.worker_id=${workerId}::uuid AND st.status IN ('planned','active')
      ORDER BY st.check_in DESC
    `:[];
    const exits=await sql<WorkerExitHistoryRow[]>`
      SELECT id,to_char(effective_date,'DD.MM.YYYY') "effectiveDate",reason_code "reasonCode",reason,status,to_char(created_at,'DD.MM.YYYY') "createdAt"
      FROM worker_exit_processes WHERE worker_id=${workerId}::uuid ORDER BY effective_date DESC,created_at DESC
    `;
    return {relationType:relation?.relationType??null,relationFrom:relation?.relationFrom??null,relationTo:relation?.relationTo??null,outstandingAssets:assets.map(row=>({...row,quantity:Number(row.quantity)})),housing,exits};
  });
}

export type StaffingForecastRow={
  organizationId:string;objectId:string;object:string;specialtyId:string;specialty:string;
  required:number;working:number;preparing:number;confirmedAbsences:number;tentativeAbsences:number;plannedExits:number;
  projectedAvailable:number;projectedDeficit:number;ownerUserId:string|null;assigneeUserIds:string[];regionId:string|null;
};

export async function listStaffingForecast(actor:Actor,horizonDays=30):Promise<StaffingForecastRow[]>{
  requireCapability(actor,"operations.need.read");
  const horizon=Math.max(7,Math.min(90,horizonDays));
  if(actor.demo){
    return demo.needs.map((need,index)=>{
      const object=demo.objects.find(row=>row.id===need.objectId);
      const working=demo.workers.filter(worker=>worker.objectId===need.objectId&&worker.status==="active").length;
      const preparing=demo.candidates.filter(candidate=>candidate.objectId===need.objectId&&["documents","clearance","preparation","first_shift"].includes(candidate.stage)).length;
      const row:StaffingForecastRow={organizationId:object?.organizationId??actor.organizationId,objectId:need.objectId,object:need.object,specialtyId:"demo-specialty-"+index,specialty:need.specialty,required:Number(need.required),working,preparing,confirmedAbsences:0,tentativeAbsences:0,plannedExits:0,projectedAvailable:working+preparing,projectedDeficit:Math.max(Number(need.required)-working-preparing,0),ownerUserId:object?.ownerUserId??null,assigneeUserIds:object?.assigneeUserIds??[],regionId:object?.regionId??null};
      return row;
    }).filter(row=>canReadRow(actor.access,"operations.need.read",row,actor));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<StaffingForecastRow[]>`
      WITH demand AS (
        SELECT n.object_id,n.specialty_id,sum(n.count_required)::int required
        FROM needs n
        WHERE n.object_id IS NOT NULL AND n.status NOT IN ('cancelled','archived')
        GROUP BY n.object_id,n.specialty_id
      )
      SELECT o.organization_id "organizationId",o.id "objectId",o.name object,d.specialty_id "specialtyId",s.name specialty,
        d.required,
        COALESCE(workforce.working,0)::int working,
        COALESCE(incoming.preparing,0)::int preparing,
        COALESCE(absences.confirmed,0)::int "confirmedAbsences",
        COALESCE(absences.tentative,0)::int "tentativeAbsences",
        COALESCE(exits.planned,0)::int "plannedExits",
        GREATEST(COALESCE(workforce.working,0)-COALESCE(unavailable.count,0)+COALESCE(incoming.preparing,0),0)::int "projectedAvailable",
        GREATEST(d.required-GREATEST(COALESCE(workforce.working,0)-COALESCE(unavailable.count,0)+COALESCE(incoming.preparing,0),0),0)::int "projectedDeficit",
        o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM demand d JOIN objects o ON o.id=d.object_id JOIN specialties s ON s.id=d.specialty_id
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT a.worker_id)::int working
        FROM worker_object_assignments a JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=o.id AND a.specialty_id=d.specialty_id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      ) workforce ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT ca.candidate_id)::int preparing
        FROM candidate_applications ca
        JOIN needs cn ON cn.id=ca.need_id
        WHERE ca.object_id=o.id AND cn.specialty_id=d.specialty_id AND ca.stage IN ('documents','clearance','preparation','first_shift')
          AND ca.actual_start_at IS NULL
          AND ((ca.planned_start_date IS NOT NULL AND ca.planned_start_date<=current_date+${horizon}::int) OR ca.stage IN ('preparation','first_shift'))
      ) incoming ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT CASE WHEN ap.status='confirmed' THEN ap.worker_id END)::int confirmed,
               count(DISTINCT CASE WHEN ap.status='tentative' THEN ap.worker_id END)::int tentative
        FROM worker_absence_plans ap
        JOIN worker_object_assignments a ON a.worker_id=ap.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
        WHERE ap.status IN ('confirmed','tentative')
          AND a.effective_from<=current_date+${horizon}::int
          AND (a.effective_to IS NULL OR a.effective_to>=current_date)
          AND ap.planned_from<=current_date+${horizon}::int
          AND (ap.planned_to IS NULL OR ap.planned_to>=current_date)
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
        SELECT count(DISTINCT x.worker_id)::int count
        FROM (
          SELECT ap.worker_id
          FROM worker_absence_plans ap
          JOIN worker_object_assignments a ON a.worker_id=ap.worker_id AND a.object_id=o.id AND a.specialty_id=d.specialty_id
          WHERE ap.status='confirmed'
            AND a.effective_from<=current_date+${horizon}::int
            AND (a.effective_to IS NULL OR a.effective_to>=current_date)
            AND ap.planned_from<=current_date+${horizon}::int
            AND (ap.planned_to IS NULL OR ap.planned_to>=current_date)
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
