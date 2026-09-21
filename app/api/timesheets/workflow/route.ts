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
      ${args.entityType},${args.entityId}::uuid,${tx.json((args.metadata??{}) as never)},${actor.userId}::uuid,${args.key},${args.processCode})
    ON CONFLICT(organization_id,automation_key) WHERE automation_key IS NOT NULL AND status NOT IN ('done','cancelled')
    DO UPDATE SET title=EXCLUDED.title,priority=EXCLUDED.priority,assignee_user_id=EXCLUDED.assignee_user_id,
      due_at=EXCLUDED.due_at,checklist_json=EXCLUDED.checklist_json,updated_at=now()
  `;
}

async function completeTask(tx:Sql,organizationId:string,key:string){
  await tx`UPDATE tasks SET status='done',completed_at=COALESCE(completed_at,now()),updated_at=now()
    WHERE organization_id=${organizationId}::uuid AND automation_key=${key} AND status NOT IN ('done','cancelled')`;
}

async function generateFinance(tx:Sql,actor:Actor,object:ObjectScope,clientSnapshot:SnapshotRow,periodStart:string,periodEnd:string){
  const internalSnapshotId=typeof clientSnapshot.snapshotJson.internalSnapshotId==="string"?clientSnapshot.snapshotJson.internalSnapshotId:null;
  if(!internalSnapshotId)throw new Error("Не найдена внутренняя версия, на основании которой сформирован клиентский табель");
  const [internal]=await tx<Array<{id:string;snapshotJson:Record<string,unknown>}>>`
    SELECT id,snapshot_json "snapshotJson" FROM timesheet_snapshots WHERE id=${internalSnapshotId}::uuid
  `;
  if(!internal)throw new Error("Внутренняя версия табеля не найдена");

  const workerRows=await tx<Array<{workerId:string;base:number|string;premium:number|string;adjustment:number|string}>>`
    WITH entries AS (
      SELECT x."workerId"::uuid worker_id,x."workDate"::date work_date,x."factHours"::numeric hours
      FROM jsonb_to_recordset(${tx.json(internal.snapshotJson as never)}->'entries') AS x("workerId" text,"workDate" text,"factHours" numeric)
      WHERE COALESCE(x."factHours",0)>0
    ), base AS (
      SELECT e.worker_id,
        COALESCE(sum(CASE rate.unit
          WHEN 'hour' THEN e.hours*rate.amount
          WHEN 'shift' THEN CASE WHEN e.hours>0 THEN rate.amount ELSE 0 END
          WHEN 'month' THEN 0
          ELSE e.hours*rate.amount END),0)::numeric base,
        COALESCE(max(CASE WHEN rate.unit='month' AND e.hours>0 THEN rate.amount ELSE 0 END),0)::numeric monthly
      FROM entries e
      LEFT JOIN LATERAL (
        SELECT r.amount,r.unit FROM worker_rates r
        WHERE r.worker_id=e.worker_id AND r.object_id=${object.objectId}::uuid
          AND r.effective_from<=e.work_date AND (r.effective_to IS NULL OR r.effective_to>=e.work_date)
        ORDER BY r.effective_from DESC LIMIT 1
      ) rate ON true
      GROUP BY e.worker_id
    )
    SELECT b.worker_id "workerId",(b.base+b.monthly)::numeric base,
      COALESCE(sum(pa.amount) FILTER(WHERE pa.adjustment_type IN ('bonus','reimbursement')),0)::numeric premium,
      COALESCE(sum(CASE WHEN pa.adjustment_type='lawful_deduction' THEN -abs(pa.amount)
                        WHEN pa.adjustment_type IN ('correction','other') THEN pa.amount ELSE 0 END),0)::numeric adjustment
    FROM base b
    LEFT JOIN pay_adjustments pa ON pa.worker_id=b.worker_id AND (pa.object_id IS NULL OR pa.object_id=${object.objectId}::uuid)
      AND pa.created_at::date BETWEEN ${periodStart}::date AND ${periodEnd}::date
    GROUP BY b.worker_id,b.base,b.monthly
  `;
  for(const row of workerRows){
    const base=Number(row.base),premium=Number(row.premium),adjustment=Number(row.adjustment),total=base+premium+adjustment;
    await tx`
      INSERT INTO worker_accruals(organization_id,worker_id,object_id,period_start,period_end,base_amount,premium_amount,adjustment_amount,total_amount,status,source_snapshot_id,created_by_user_id,approved_by_user_id)
      SELECT ${actor.organizationId}::uuid,${row.workerId}::uuid,${object.objectId}::uuid,${periodStart}::date,${periodEnd}::date,
        ${base},${premium},${adjustment},${total},'approved',${internal.id}::uuid,${actor.userId}::uuid,${actor.userId}::uuid
      WHERE NOT EXISTS(
        SELECT 1 FROM worker_accruals WHERE worker_id=${row.workerId}::uuid AND object_id=${object.objectId}::uuid AND source_snapshot_id=${internal.id}::uuid
      )
    `;
  }

  const revenueRows=await tx<Array<{specialtyId:string;clientRateId:string;hours:number|string;rate:number|string}>>`
    WITH entries AS (
      SELECT x."workerId"::uuid worker_id,x."workDate"::date work_date,x."factHours"::numeric hours
      FROM jsonb_to_recordset(${tx.json(clientSnapshot.snapshotJson as never)}->'entries') AS x("workerId" text,"workDate" text,"factHours" numeric)
      WHERE COALESCE(x."factHours",0)>0
    ), rated AS (
      SELECT e.hours,a.specialty_id,cr.id client_rate_id,cr.amount rate
      FROM entries e
      JOIN LATERAL (
        SELECT wa.specialty_id FROM worker_object_assignments wa
        WHERE wa.worker_id=e.worker_id AND wa.object_id=${object.objectId}::uuid
          AND wa.effective_from<=e.work_date AND (wa.effective_to IS NULL OR wa.effective_to>=e.work_date)
        ORDER BY wa.effective_from DESC LIMIT 1
      ) a ON true
      JOIN LATERAL (
        SELECT r.id,r.amount FROM client_rates r
        WHERE r.object_id=${object.objectId}::uuid AND r.specialty_id=a.specialty_id
          AND r.effective_from<=e.work_date AND (r.effective_to IS NULL OR r.effective_to>=e.work_date)
        ORDER BY r.effective_from DESC LIMIT 1
      ) cr ON true
    )
    SELECT specialty_id "specialtyId",client_rate_id "clientRateId",sum(hours)::numeric hours,max(rate)::numeric rate
    FROM rated GROUP BY specialty_id,client_rate_id
  `;
  for(const row of revenueRows){
    const hours=Number(row.hours),rate=Number(row.rate);
    await tx`
      INSERT INTO client_revenue_lines(organization_id,client_company_id,object_id,client_rate_id,period_start,period_end,quantity,unit,rate,amount,source_snapshot_id,status,created_by_user_id)
      SELECT ${actor.organizationId}::uuid,${object.clientId}::uuid,${object.objectId}::uuid,${row.clientRateId}::uuid,
        ${periodStart}::date,${periodEnd}::date,${hours},'hour',${rate},${hours*rate},${clientSnapshot.id}::uuid,'approved',${actor.userId}::uuid
      WHERE NOT EXISTS(
        SELECT 1 FROM client_revenue_lines WHERE object_id=${object.objectId}::uuid AND source_snapshot_id=${clientSnapshot.id}::uuid AND client_rate_id=${row.clientRateId}::uuid
      )
    `;
  }

  const [totals]=await tx<Array<{revenue:number|string;workerCost:number|string;expenses:number|string}>>`
    SELECT
      COALESCE((SELECT sum(amount) FROM client_revenue_lines WHERE object_id=${object.objectId}::uuid AND source_snapshot_id=${clientSnapshot.id}::uuid),0)::numeric revenue,
      COALESCE((SELECT sum(total_amount) FROM worker_accruals WHERE object_id=${object.objectId}::uuid AND source_snapshot_id=${internal.id}::uuid),0)::numeric "workerCost",
      COALESCE((SELECT sum(amount) FROM object_expenses WHERE object_id=${object.objectId}::uuid AND expense_date BETWEEN ${periodStart}::date AND ${periodEnd}::date AND plan_fact='fact'),0)::numeric expenses
  `;
  const revenue=Number(totals?.revenue??0),workerCost=Number(totals?.workerCost??0),expenses=Number(totals?.expenses??0);
  const contribution=revenue-workerCost-expenses;
  const marginPct=revenue?contribution/revenue*100:0;
  await tx`
    INSERT INTO pnl_snapshots(organization_id,object_id,period_start,period_end,scenario,revenue,worker_cost,object_expenses,contribution,margin_pct,snapshot_json)
    VALUES(${actor.organizationId}::uuid,${object.objectId}::uuid,${periodStart}::date,${periodEnd}::date,'fact',${revenue},${workerCost},${expenses},${contribution},${marginPct},
      ${tx.json({source:"closed_timesheet",clientSnapshotId:clientSnapshot.id,internalSnapshotId:internal.id})})
  `;
  return {revenue,workerCost,expenses,contribution,marginPct,accruals:workerRows.length,revenueLines:revenueRows.length};
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(actor.demo)return NextResponse.json({error:"Демо-режим доступен только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const capability=body.action==="review_internal"||body.action==="return_internal"?"time.timesheet.review":
      body.action==="client_approve"||body.action==="client_return"?"time.timesheet.approve_client":
      body.action==="close"?"finance.worker_accrual.edit":"time.timesheet.submit";
    requireCapability(actor,capability);
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const object=await loadObject(tx,body.objectId);
      if(!object||!canReadRow(actor.access,capability,object,actor))throw new AccessDeniedError(capability);
      const internal=await latestSnapshot(tx,body.objectId,"internal",body.periodStart,body.periodEnd);
      const client=await latestSnapshot(tx,body.objectId,"client",body.periodStart,body.periodEnd);
      const baseKey=`timesheet:${body.objectId}:${body.periodStart}:${body.periodEnd}`;

      if(body.action==="submit_internal"){
        if(client&&["client_sent","client_approved","closed"].includes(client.status))throw new Error("Клиентская версия уже зафиксирована. Сначала завершите текущий цикл.");
        if(internal&&internal.status==="internal_submitted")throw new Error("Внутренний табель уже передан на проверку");
        if(internal&&internal.status==="internal_checked")throw new Error("Внутренний табель уже проверен");
        const payload=await captureFact(tx,body.objectId,"internal",body.periodStart,body.periodEnd);
        const version=(internal?.version??0)+1;
        const [row]=await tx<Array<{id:string}>>`
          INSERT INTO timesheet_snapshots(organization_id,object_id,view_type,period_type,period_start,period_end,status,snapshot_json,version,supersedes_snapshot_id,workflow_comment,submitted_by_user_id,submitted_at)
          VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,'internal','month',${body.periodStart}::date,${body.periodEnd}::date,'internal_submitted',
            ${tx.json(payload)},${version},${internal?.id??null}::uuid,${body.comment??null},${actor.userId}::uuid,now()) RETURNING id
        `;
        const approver=(await managerFor(tx,object.ownerUserId??actor.userId))??(await responsibilityOwner(tx,"operations","portfolio",object.regionId));
        await upsertTask(tx,actor,{key:baseKey+":review",title:"Проверить внутренний табель",assignee:approver,entityType:"object",entityId:body.objectId,processCode:"timesheet.internal_review",priority:"high",metadata:{snapshotId:row.id,periodStart:body.periodStart,periodEnd:body.periodEnd}});
        return {status:"internal_submitted",snapshotId:row.id,version};
      }

      if(body.action==="review_internal"||body.action==="return_internal"){
        if(!internal||internal.status!=="internal_submitted")throw new Error("Нет внутреннего табеля, ожидающего проверки");
        const status=body.action==="review_internal"?"internal_checked":"returned";
        await tx`UPDATE timesheet_snapshots SET status=${status},workflow_comment=${body.comment??null},checked_by_user_id=${actor.userId}::uuid,checked_at=now() WHERE id=${internal.id}::uuid`;
        await completeTask(tx,actor.organizationId,baseKey+":review");
        if(status==="returned")await upsertTask(tx,actor,{key:baseKey+":correct",title:"Исправить возвращённый табель",assignee:object.ownerUserId,entityType:"object",entityId:body.objectId,processCode:"timesheet.correction",priority:"high",metadata:{snapshotId:internal.id,comment:body.comment??null}});
        return {status,snapshotId:internal.id,version:internal.version};
      }

      if(body.action==="send_client"){
        if(!internal||internal.status!=="internal_checked")throw new Error("Сначала внутренний табель должен пройти проверку");
        if(client&&client.status==="client_sent")throw new Error("Клиентская версия уже отправлена и ожидает решения");
        if(client&&["client_approved","closed"].includes(client.status))throw new Error("Клиентская версия уже согласована");
        const payload={...(await captureFact(tx,body.objectId,"client",body.periodStart,body.periodEnd)),internalSnapshotId:internal.id};
        const version=(client?.version??0)+1;
        const [row]=await tx<Array<{id:string}>>`
          INSERT INTO timesheet_snapshots(organization_id,object_id,view_type,period_type,period_start,period_end,status,snapshot_json,version,supersedes_snapshot_id,workflow_comment,submitted_by_user_id,submitted_at,client_sent_by_user_id,client_sent_at)
          VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,'client','month',${body.periodStart}::date,${body.periodEnd}::date,'client_sent',
            ${tx.json(payload)},${version},${client?.id??null}::uuid,${body.comment??null},${actor.userId}::uuid,now(),${actor.userId}::uuid,now()) RETURNING id
        `;
        await completeTask(tx,actor.organizationId,baseKey+":correct");
        await upsertTask(tx,actor,{key:baseKey+":client",title:"Получить подтверждение клиентского табеля",assignee:object.ownerUserId??actor.userId,entityType:"object",entityId:body.objectId,processCode:"timesheet.client_approval",priority:"high",metadata:{snapshotId:row.id,periodStart:body.periodStart,periodEnd:body.periodEnd}});
        return {status:"client_sent",snapshotId:row.id,version};
      }

      if(body.action==="client_approve"||body.action==="client_return"){
        if(!client||client.status!=="client_sent")throw new Error("Нет клиентской версии, ожидающей решения");
        const status=body.action==="client_approve"?"client_approved":"returned";
        await tx`UPDATE timesheet_snapshots SET status=${status},workflow_comment=${body.comment??null},
          approved_by_user_id=${status==="client_approved"?actor.userId:null}::uuid,approved_at=${status==="client_approved"?new Date().toISOString():null}::timestamptz
          WHERE id=${client.id}::uuid`;
        await completeTask(tx,actor.organizationId,baseKey+":client");
        if(status==="returned"){
          await tx`UPDATE timesheet_snapshots SET status='returned',workflow_comment=${body.comment??null} WHERE id=${internal?.id??null}::uuid`;
          await upsertTask(tx,actor,{key:baseKey+":correct",title:"Исправить табель после возврата клиентом",assignee:object.ownerUserId,entityType:"object",entityId:body.objectId,processCode:"timesheet.correction",priority:"critical",metadata:{snapshotId:client.id,comment:body.comment??null}});
        }else{
          const finance=(await responsibilityOwner(tx,"finance","control",object.regionId))??actor.userId;
          await upsertTask(tx,actor,{key:baseKey+":close",title:"Закрыть табель и сформировать начисления",assignee:finance,entityType:"object",entityId:body.objectId,processCode:"timesheet.finance_close",priority:"high",metadata:{snapshotId:client.id,periodStart:body.periodStart,periodEnd:body.periodEnd}});
        }
        return {status,snapshotId:client.id,version:client.version};
      }

      if(!client||client.status!=="client_approved")throw new Error("Период можно закрыть только после подтверждения клиентом");
      const finance=await generateFinance(tx,actor,object,client,body.periodStart,body.periodEnd);
      await tx`UPDATE timesheet_snapshots SET status='closed',closed_by_user_id=${actor.userId}::uuid,closed_at=now(),workflow_comment=COALESCE(${body.comment??null},workflow_comment) WHERE id=${client.id}::uuid`;
      const linkedInternal=typeof client.snapshotJson.internalSnapshotId==="string"?client.snapshotJson.internalSnapshotId:null;
      if(linkedInternal)await tx`UPDATE timesheet_snapshots SET status='closed',closed_by_user_id=${actor.userId}::uuid,closed_at=now() WHERE id=${linkedInternal}::uuid`;
      await completeTask(tx,actor.organizationId,baseKey+":close");
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'timesheet',${client.id}::uuid,'period_closed',
          'Табель закрыт: сформированы начисления, клиентская выручка и фактический P&L',${tx.json({objectId:body.objectId,periodStart:body.periodStart,periodEnd:body.periodEnd,...finance})})
      `;
      return {status:"closed",snapshotId:client.id,version:client.version,finance};
    }));
    return NextResponse.json(result,{status:body.action==="submit_internal"||body.action==="send_client"?201:200});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие с табелем",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав для этого этапа табеля"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось выполнить действие с табелем"},{status:500});
  }
}
