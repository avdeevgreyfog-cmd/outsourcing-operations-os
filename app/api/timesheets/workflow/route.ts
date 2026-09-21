import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import type { Actor } from "@/lib/access/types";

const schema=z.object({
  action:z.enum(["submit_internal","review_internal","return_internal","send_client","client_approve","client_return","close"]),
  objectId:z.string().uuid(),
  periodStart:z.string().date(),
  periodEnd:z.string().date(),
  comment:z.string().trim().max(2000).nullable().optional(),
});

type ObjectScope={
  organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[];
};

type SnapshotRow={
  id:string;status:string;version:number;snapshotJson:Record<string,unknown>;submittedByUserId:string|null;
};

async function loadObject(tx:Sql,objectId:string):Promise<ObjectScope|null>{
  const [row]=await tx<Array<ObjectScope>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      o.client_company_id "clientId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa
        WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.id=${objectId}::uuid
  `;
  return row??null;
}

async function latestSnapshot(tx:Sql,objectId:string,viewType:"internal"|"client",periodStart:string,periodEnd:string):Promise<SnapshotRow|null>{
  const [row]=await tx<Array<SnapshotRow>>`
    SELECT id,status,version,snapshot_json "snapshotJson",submitted_by_user_id "submittedByUserId"
    FROM timesheet_snapshots
    WHERE object_id=${objectId}::uuid AND view_type=${viewType}
      AND period_start=${periodStart}::date AND period_end=${periodEnd}::date
    ORDER BY version DESC,created_at DESC LIMIT 1
  `;
  return row??null;
}

async function captureFact(tx:Sql,objectId:string,viewType:"internal"|"client",periodStart:string,periodEnd:string){
  const entries=await tx<Array<{workerId:string;workDate:string;timeCode:string;factHours:number|string;dayHours:number|string;nightHours:number|string;overtimeHours:number|string}>>`
    SELECT worker_id "workerId",work_date::text "workDate",time_code "timeCode",
      fact_hours::numeric "factHours",day_hours::numeric "dayHours",night_hours::numeric "nightHours",overtime_hours::numeric "overtimeHours"
    FROM time_entries
    WHERE object_id=${objectId}::uuid AND work_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
    ORDER BY work_date,worker_id
  `;
  const normalized=entries.map(row=>({
    ...row,
    factHours:Number(row.factHours),dayHours:Number(row.dayHours),nightHours:Number(row.nightHours),overtimeHours:Number(row.overtimeHours),
  }));
  return {
    hours:normalized.reduce((sum,row)=>sum+row.factHours,0),
    generatedAt:new Date().toISOString(),
    viewType,
    entries:normalized,
  };
}

async function managerFor(tx:Sql,userId:string|null){
  if(!userId)return null;
  const [row]=await tx<Array<{userId:string|null}>>`
    SELECT m.user_id "userId"
    FROM organization_memberships source
    LEFT JOIN organization_memberships m ON m.id=resolve_employee_manager(source.id,current_date)
    WHERE source.user_id=${userId}::uuid AND source.status='active' LIMIT 1
  `;
  return row?.userId??null;
}

async function responsibilityOwner(tx:Sql,processCode:string,stepCode:string,regionId:string|null){
  const [row]=await tx<Array<{userId:string|null}>>`
    SELECT user_id "userId"
    FROM resolve_organization_responsibility(${processCode},${stepCode},${regionId?"region":"all_org"},${regionId}::uuid,current_date)
    WHERE user_id IS NOT NULL LIMIT 1
  `;
  return row?.userId??null;
}

async function upsertTask(tx:Sql,actor:Actor,args:{key:string;title:string;assignee:string|null;dueAt?:string|null;entityType:string;entityId:string;processCode:string;priority?:"normal"|"high"|"critical";metadata?:Record<string,unknown>}){
  if(!args.assignee)return;
  await tx`
    INSERT INTO tasks(organization_id,title,status,priority,assignee_user_id,due_at,entity_type,entity_id,checklist_json,created_by_user_id,automation_key,process_code)
    VALUES(${actor.organizationId}::uuid,${args.title},'open',${args.priority??"normal"},${args.assignee}::uuid,${args.dueAt??null}::timestamptz,
      ${args.entityType},${args.entityId}::uuid,${tx.json(args.metadata??{})},${actor.userId}::uuid,${args.key},${args.processCode})
    ON CONFLICT(organization_id,automation_key) WHERE automation_key IS NOT NULL AND status NOT IN ('done','cancelled')
    DO UPDATE SE