import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type ObjectAnalyticsDailyPoint={
  date:string;
  label:string;
  planned:number;
  working:number;
  shiftDemand:number;
  shiftAssigned:number;
  worked:number;
  noShows:number;
  hours:number;
  incidents:number;
};

export type ObjectAnalyticsSpecialtyActivity={
  specialtyId:string;
  specialty:string;
  shiftDemand:number;
  assigned:number;
  worked:number;
  noShows:number;
  hours:number;
};

export type ObjectAnalyticsMovementPoint={
  periodStart:string;
  label:string;
  started:number;
  ended:number;
};

export type ObjectAnalyticsIncidentType={
  type:string;
  count:number;
};

export type ObjectAnalyticsDetail={
  from:string;
  to:string;
  daily:ObjectAnalyticsDailyPoint[];
  specialties:ObjectAnalyticsSpecialtyActivity[];
  movements:ObjectAnalyticsMovementPoint[];
  incidentTypes:ObjectAnalyticsIncidentType[];
};

function dateRange(from:string,to:string){
  const out:string[]=[];
  const cursor=new Date(from+"T00:00:00Z");
  const end=new Date(to+"T00:00:00Z");
  while(cursor<=end){out.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1)}
  return out;
}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function weekStart(value:string){
  const date=new Date(value+"T00:00:00Z");const day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return date.toISOString().slice(0,10);
}

export async function getObjectAnalyticsDetail(actor:Actor,objectId:string,from:string,to:string):Promise<ObjectAnalyticsDetail|null>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo){
    const object=demo.objects.find(row=>row.id===objectId&&canReadRow(actor.access,"operations.object.read",row,actor));
    if(!object)return null;
    const dates=dateRange(from,to);
    const activeWorkers=demo.workers.filter(row=>row.objectId===objectId&&row.status==="active");
    const plan=demo.needs.filter(row=>row.objectId===objectId).reduce((sum,row)=>sum+Number(row.required??0),0);
    const specialties=[...new Set([
      ...demo.needs.filter(row=>row.objectId===objectId).map(row=>row.specialty),
      ...activeWorkers.map(row=>row.specialty).filter((value):value is string=>Boolean(value)),
    ])];
    const daily=dates.map((date,index)=>{
      const dayWorkers=activeWorkers.filter(worker=>!worker.startDate||worker.startDate<=date);
      const noShows=dayWorkers.filter((_,workerIndex)=>index%11===6&&workerIndex%9===4).length;
      const demand=dayWorkers.length||plan;
      const worked=Math.max(demand-noShows,0);
      return {date,label:shortDate(date),planned:plan,working:dayWorkers.length,shiftDemand:demand,shiftAssigned:demand,worked,noShows,hours:worked*11,incidents:0};
    });
    const specialtiesRows=specialties.map((specialty,index)=>{
      const workers=activeWorkers.filter(row=>row.specialty===specialty).length;
      const specialtyPlan=demo.needs.filter(row=>row.objectId===objectId&&row.specialty===specialty).reduce((sum,row)=>sum+Number(row.required??0),0);
      return {specialtyId:`demo-specialty-${index+1}`,specialty,shiftDemand:specialtyPlan,assigned:workers,worked:workers,noShows:0,hours:workers*11};
    });
    const movementMap=new Map<string,{started:number;ended:number}>();
    for(const date of dates){const key=weekStart(date);if(!movementMap.has(key))movementMap.set(key,{started:0,ended:0})}
    for(const worker of demo.workers.filter(row=>row.objectId===objectId)){
      if(worker.startDate&&worker.startDate>=from&&worker.startDate<=to){const key=weekStart(worker.startDate);const item=movementMap.get(key);if(item)item.started+=1}
    }
    const movements=[...movementMap.entries()].map(([periodStart,value])=>({periodStart,label:shortDate(periodStart),...value}));
    const incidentTypes=[...new Map(demo.incidents.filter(row=>row.objectId===objectId).map(row=>[row.type??"other",0])).keys()].map(type=>({
      type,count:demo.incidents.filter(row=>row.objectId===objectId&&(row.type??"other")===type).length,
    }));
    return {from,to,daily,specialties:specialtiesRows,movements,incidentTypes};
  }

  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [scope]=await sql<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.id=${objectId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"operations.object.read",scope,actor))return null;

    const daily=await sql<ObjectAnalyticsDailyPoint[]>`
      WITH days AS (
        SELECT generate_series(${from}::date,${to}::date,interval '1 day')::date day
      )
      SELECT
        d.day::text date,to_char(d.day,'DD.MM') label,
        COALESCE((
          SELECT sum(target.planned_count)::int FROM (
            SELECT DISTINCT ON (t.specialty_id,t.shift_kind) t.planned_count
            FROM staffing_plan_targets t
            WHERE t.object_id=${objectId}::uuid
              AND t.effective_from<=d.day
              AND (t.effective_to IS NULL OR t.effective_to>=d.day)
            ORDER BY t.specialty_id,t.shift_kind,t.effective_from DESC,t.created_at DESC
          ) target
        ),0)::int planned,
        COALESCE((
          SELECT count(DISTINCT a.worker_id)::int
          FROM worker_object_assignments a
          WHERE a.object_id=${objectId}::uuid
            AND a.effective_from<=d.day
            AND (a.effective_to IS NULL OR a.effective_to>=d.day)
        ),0)::int working,
        COALESCE((
          SELECT sum(sh.demand_count)::int FROM shifts sh
          WHERE sh.object_id=${objectId}::uuid AND sh.shift_date=d.day
        ),0)::int "shiftDemand",
        COALESCE((
          SELECT count(*)::int
          FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
          WHERE sh.object_id=${objectId}::uuid AND sh.shift_date=d.day
            AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'
        ),0)::int "shiftAssigned",
        COALESCE((
          SELECT count(DISTINCT te.worker_id)::int FROM time_entries te
          WHERE te.object_id=${objectId}::uuid AND te.work_date=d.day AND COALESCE(te.fact_hours,0)>0
        ),0)::int worked,
        COALESCE((
          SELECT count(DISTINCT te.worker_id)::int FROM time_entries te
          WHERE te.object_id=${objectId}::uuid AND te.work_date=d.day AND te.time_code='NO_SHOW'
        ),0)::int "noShows",
        COALESCE((
          SELECT sum(COALESCE(te.fact_hours,0))::numeric FROM time_entries te
          WHERE te.object_id=${objectId}::uuid AND te.work_date=d.day
        ),0)::numeric hours,
        COALESCE((
          SELECT count(*)::int FROM incidents i
          WHERE i.object_id=${objectId}::uuid AND i.occurred_at::date=d.day
        ),0)::int incidents
      FROM days d ORDER BY d.day
    `;

    const specialties=await sql<ObjectAnalyticsSpecialtyActivity[]>`
      WITH shift_stats AS (
        SELECT sh.specialty_id,
          sum(sh.demand_count)::int "shiftDemand",
          count(sa.id) FILTER (WHERE NOT sa.is_reserve AND sa.confirmation_status<>'cancelled')::int assigned
        FROM shifts sh
        LEFT JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sh.object_id=${objectId}::uuid AND sh.shift_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY sh.specialty_id
      ),
      time_stats AS (
        SELECT a.specialty_id,
          count(DISTINCT (te.worker_id,te.work_date)) FILTER (WHERE COALESCE(te.fact_hours,0)>0)::int worked,
          count(DISTINCT (te.worker_id,te.work_date)) FILTER (WHERE te.time_code='NO_SHOW')::int "noShows",
          COALESCE(sum(COALESCE(te.fact_hours,0)),0)::numeric hours
        FROM time_entries te
        JOIN LATERAL (
          SELECT woa.specialty_id
          FROM worker_object_assignments woa
          WHERE woa.worker_id=te.worker_id AND woa.object_id=te.object_id
            AND woa.effective_from<=te.work_date
            AND (woa.effective_to IS NULL OR woa.effective_to>=te.work_date)
          ORDER BY woa.effective_from DESC LIMIT 1
        ) a ON true
        WHERE te.object_id=${objectId}::uuid AND te.work_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY a.specialty_id
      ),
      specialty_ids AS (
        SELECT specialty_id FROM shift_stats
        UNION
        SELECT specialty_id FROM time_stats
      )
      SELECT s.id "specialtyId",s.name specialty,
        COALESCE(ss."shiftDemand",0)::int "shiftDemand",
        COALESCE(ss.assigned,0)::int assigned,
        COALESCE(ts.worked,0)::int worked,
        COALESCE(ts."noShows",0)::int "noShows",
        COALESCE(ts.hours,0)::numeric hours
      FROM specialty_ids x JOIN specialties s ON s.id=x.specialty_id
      LEFT JOIN shift_stats ss ON ss.specialty_id=x.specialty_id
      LEFT JOIN time_stats ts ON ts.specialty_id=x.specialty_id
      ORDER BY s.name
    `;

    const movements=await sql<ObjectAnalyticsMovementPoint[]>`
      WITH weeks AS (
        SELECT generate_series(date_trunc('week',${from}::date),date_trunc('week',${to}::date),interval '1 week')::date week_start
      )
      SELECT w.week_start::text "periodStart",to_char(w.week_start,'DD.MM') label,
        COALESCE((SELECT count(*)::int FROM worker_object_assignments a
          WHERE a.object_id=${objectId}::uuid AND a.effective_from>=w.week_start AND a.effective_from<w.week_start+7),0)::int started,
        COALESCE((SELECT count(*)::int FROM worker_object_assignments a
          WHERE a.object_id=${objectId}::uuid AND a.effective_to>=w.week_start AND a.effective_to<w.week_start+7),0)::int ended
      FROM weeks w ORDER BY w.week_start
    `;

    const incidentTypes=await sql<ObjectAnalyticsIncidentType[]>`
      SELECT i.incident_type type,count(*)::int count
      FROM incidents i
      WHERE i.object_id=${objectId}::uuid AND i.occurred_at::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY i.incident_type ORDER BY count(*) DESC,i.incident_type
    `;

    return {from,to,daily,specialties,movements,incidentTypes};
  });
}
