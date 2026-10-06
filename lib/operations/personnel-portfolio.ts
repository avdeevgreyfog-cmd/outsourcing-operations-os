import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { getTimesheet } from "@/lib/data/service";

export type TimesheetPortfolioRow={
  organizationId:string;
  objectId:string;
  object:string;
  client:string|null;
  managerId:string|null;
  manager:string|null;
  ownerUserId:string|null;
  regionId:string|null;
  assigneeUserIds:string[];
  month:string;
  workerCount:number;
  internalHours:number;
  clientHours:number|null;
  discrepancy:number|null;
  status:string;
  internalStatus:string|null;
  clientStatus:string|null;
  issueCount:number;
  lastChanged:string|null;
};

function validMonth(value?:string|null){
  return value&&/^\d{4}-\d{2}$/.test(value)?value:new Date().toISOString().slice(0,7);
}
function monthBounds(month:string){
  const [year,monthNumber]=month.split("-").map(Number);
  return {start:month+"-01",end:new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10)};
}
function displayDateTime(value:string|null|undefined){
  if(!value)return null;
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(value));
}

export async function listTimesheetPortfolio(actor:Actor,monthInput?:string|null):Promise<TimesheetPortfolioRow[]>{
  requireCapability(actor,"time.timesheet.read");
  const month=validMonth(monthInput);
  const {start,end}=monthBounds(month);

  if(actor.demo){
    const visible=demo.objects.filter(row=>canReadRow(actor.access,"time.timesheet.read",row,actor));
    const data=await Promise.all(visible.map(object=>getTimesheet(actor,{objectId:object.id,month})));
    return visible.map((object,index)=>{
      const timesheet=data[index];
      const manager=(object as typeof object&{ownerName?:string|null}).ownerName??null;
      return {
        organizationId:object.organizationId,objectId:object.id,object:object.name,client:null,
        managerId:object.ownerUserId??null,manager,ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,
        assigneeUserIds:object.assigneeUserIds??[],month,
        workerCount:timesheet?.rows.filter(row=>row.rowKind!=="candidate").length??0,
        internalHours:Number(timesheet?.internalHours??0),
        clientHours:timesheet?.clientSnapshot?Number(timesheet.clientHours):null,
        discrepancy:timesheet?.clientSnapshot?Number(timesheet.discrepancy):null,
        status:timesheet?.status??"draft",
        internalStatus:timesheet?.internalSnapshot?.status??null,
        clientStatus:timesheet?.clientSnapshot?.status??null,
        issueCount:timesheet?.issue?1:0,lastChanged:timesheet?.clientSnapshot?.createdAt??timesheet?.internalSnapshot?.createdAt??null,
      };
    });
  }

  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const scopes=await sql<Array<{
      organizationId:string;objectId:string;object:string;client:string|null;managerId:string|null;manager:string|null;
      ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
    }>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.name object,c.name client,
        o.owner_user_id "managerId",u.display_name manager,o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o
      LEFT JOIN client_companies c ON c.id=o.client_company_id
      LEFT JOIN app_users u ON u.id=o.owner_user_id
      WHERE o.status NOT IN ('archived','completed')
      ORDER BY u.display_name NULLS LAST,o.name
    `;
    const visible=scopes.filter(row=>canReadRow(actor.access,"time.timesheet.read",row,actor));
    const objectIds=visible.map(row=>row.objectId);
    if(!objectIds.length)return [];

    const aggregates=await sql<Array<{
      objectId:string;workerCount:number;internalHours:number|string;clientHours:number|string|null;
      internalStatus:string|null;clientStatus:string|null;issueCount:number;lastChanged:string|null;
    }>>`
      WITH objects_scope AS (
        SELECT unnest(${objectIds}::uuid[]) object_id
      ),
      hours AS (
        SELECT te.object_id,
          COALESCE(sum(te.fact_hours),0)::numeric internal_hours,
          max(te.updated_at) last_entry_at
        FROM time_entries te
        JOIN objects_scope os ON os.object_id=te.object_id
        WHERE te.work_date BETWEEN ${start}::date AND ${end}::date
        GROUP BY te.object_id
      ),
      workforce AS (
        SELECT a.object_id,count(DISTINCT a.worker_id)::int worker_count
        FROM worker_object_assignments a
        JOIN objects_scope os ON os.object_id=a.object_id
        WHERE a.effective_from<=${end}::date AND (a.effective_to IS NULL OR a.effective_to>=${start}::date)
        GROUP BY a.object_id
      )
      SELECT os.object_id "objectId",
        COALESCE(wf.worker_count,0)::int "workerCount",
        COALESCE(h.internal_hours,0)::numeric "internalHours",
        client.hours::numeric "clientHours",
        internal.status "internalStatus",client.status "clientStatus",
        COALESCE(issues.issue_count,0)::int "issueCount",
        to_char(GREATEST(
          COALESCE(h.last_entry_at,'epoch'::timestamptz),
          COALESCE(internal.created_at,'epoch'::timestamptz),
          COALESCE(client.created_at,'epoch'::timestamptz),
          COALESCE(issues.last_issue_at,'epoch'::timestamptz)
        ),'YYYY-MM-DD"T"HH24:MI:SS"Z"') "lastChanged"
      FROM objects_scope os
      LEFT JOIN hours h ON h.object_id=os.object_id
      LEFT JOIN workforce wf ON wf.object_id=os.object_id
      LEFT JOIN LATERAL (
        SELECT (ts.snapshot_json->>'hours')::numeric hours,ts.status,ts.created_at
        FROM timesheet_snapshots ts
        WHERE ts.object_id=os.object_id AND ts.view_type='internal'
          AND ts.period_start=${start}::date AND ts.period_end=${end}::date
        ORDER BY COALESCE(ts.version,1) DESC,ts.created_at DESC LIMIT 1
      ) internal ON true
      LEFT JOIN LATERAL (
        SELECT (ts.snapshot_json->>'hours')::numeric hours,ts.status,ts.created_at
        FROM timesheet_snapshots ts
        WHERE ts.object_id=os.object_id AND ts.view_type='client'
          AND ts.period_start=${start}::date AND ts.period_end=${end}::date
        ORDER BY COALESCE(ts.version,1) DESC,ts.created_at DESC LIMIT 1
      ) client ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int issue_count,max(r.created_at) last_issue_at
        FROM reconciliation_issues r
        WHERE r.object_id=os.object_id AND r.status<>'resolved'
          AND (r.work_date IS NULL OR r.work_date BETWEEN ${start}::date AND ${end}::date)
      ) issues ON true
    `;
    const byObject=new Map(aggregates.map(row=>[row.objectId,row]));
    return visible.map(scope=>{
      const agg=byObject.get(scope.objectId);
      const internalHours=Number(agg?.internalHours??0);
      const clientHours=agg?.clientHours==null?null:Number(agg.clientHours);
      const status=agg?.clientStatus??agg?.internalStatus??(internalHours>0?"draft":"not_started");
      return {...scope,month,workerCount:Number(agg?.workerCount??0),internalHours,clientHours,
        discrepancy:clientHours==null?null:internalHours-clientHours,status,
        internalStatus:agg?.internalStatus??null,clientStatus:agg?.clientStatus??null,
        issueCount:Number(agg?.issueCount??0),lastChanged:displayDateTime(agg?.lastChanged)};
    });
  });
}
