import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { defaultRequestStages, type RequestStageDefinition } from "./request-workflow";
import { getRequestWorkspaceOptions, listRequestBoard } from "./request-workflow-server";
import { analyticsFromBoardRows, buildPeriodAnalytics, matchesFilters, type RequestAnalyticsData, type RequestAnalyticsFilters, type AnalyticsRequest, type StageEvent } from "./request-analytics-calculation";
export * from "./request-analytics-calculation";

export async function getRequestAnalytics(actor:Actor,filters:RequestAnalyticsFilters):Promise<RequestAnalyticsData>{
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return analyticsFromBoardRows(await listRequestBoard(actor),filters,defaultRequestStages,(await getRequestWorkspaceOptions(actor)).specialties);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const stages=await sql<RequestStageDefinition[]>`
      SELECT code,label,sort_order "sortOrder",color,active,terminal_kind "terminalKind"
      FROM request_stage_definitions WHERE active OR code IN ('new','agreed','not_agreed') ORDER BY sort_order,created_at
    `;
    const periodRows=await sql<AnalyticsRequest[]>`
      SELECT r.id,r.organization_id "organizationId",r.client_company_id "clientId",COALESCE(c.name,'Без клиента') client,
        r.owner_user_id "ownerUserId",owner.display_name owner,r.region_id "regionId",r.source,r.created_by_user_id "createdByUserId",
        COALESCE(r.workflow_stage_code,'new') "rawStage",r.loss_reason_code "lossReasonCode",
        COALESCE((SELECT sum(rr.count_required)::int FROM request_roles rr WHERE rr.request_id=r.id),0) headcount,
        COALESCE((SELECT array_agg(DISTINCT rr.specialty_id::text) FROM request_roles rr WHERE rr.request_id=r.id),'{}'::text[]) "specialtyIds",
        r.created_at::text "createdAt",r.updated_at::text "updatedAt",
        (SELECT min(p.sent_at)::text FROM proposals p WHERE p.request_id=r.id AND p.sent_at IS NOT NULL) "firstProposalAt",
        (SELECT min(p.accepted_at)::text FROM proposals p WHERE p.request_id=r.id AND p.accepted_at IS NOT NULL) "acceptedAt"
      FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id
      WHERE r.created_at<(${latest}::date+INTERVAL '1 day')
    `;
    const snapshotRows=await sql<AnalyticsRequest[]>`
      SELECT r.id,r.organization_id "organizationId",r.client_company_id "clientId",COALESCE(c.name,'Без клиента') client,
        r.owner_user_id "ownerUserId",owner.display_name owner,r.region_id "regionId",r.source,r.created_by_user_id "createdByUserId",
        COALESCE(r.workflow_stage_code,'new') "rawStage",r.loss_reason_code "lossReasonCode",
        COALESCE((SELECT sum(rr.count_required)::int FROM request_roles rr WHERE rr.request_id=r.id),0) headcount,
        COALESCE((SELECT array_agg(DISTINCT rr.specialty_id::text) FROM request_roles rr WHERE rr.request_id=r.id),'{}'::text[]) "specialtyIds",
        r.created_at::text "createdAt",r.updated_at::text "updatedAt",
        (SELECT min(p.sent_at)::text FROM proposals p WHERE p.request_id=r.id AND p.sent_at IS NOT NULL) "firstProposalAt",
        (SELECT min(p.accepted_at)::text FROM proposals p WHERE p.request_id=r.id AND p.accepted_at IS NOT NULL) "acceptedAt"
      FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id
      WHERE r.archived_at IS NULL
    `;
    const accessible=periodRows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor)).filter(row=>matchesFilters(row,filters));
    const snapshot=snapshotRows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor)).filter(row=>matchesFilters(row,filters));
    const ids=accessible.map(row=>row.id);
    const history=ids.length?await sql<StageEvent[]>`
      SELECT request_id "requestId",to_stage_code "toStageCode",loss_reason_code "lossReasonCode",created_at::text "createdAt"
      FROM request_stage_history WHERE request_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY request_id,created_at
    `:[];
    const current=buildPeriodAnalytics(accessible,history,filters.from,filters.to,stages,snapshot);
    const previous=buildPeriodAnalytics(accessible,history,filters.compareFrom,filters.compareTo,stages,snapshot);
    const reasonCodes=[...current.lossMap.keys()];
    const reasonRows=reasonCodes.length?await sql<Array<{code:string;label:string}>>`
      SELECT code,name label FROM request_loss_reasons WHERE code=ANY(${reasonCodes}::text[])
    `:[];
    const labels=new Map(reasonRows.map(row=>[row.code,row.label]));
    return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:labels.get(code)??"Причина не указана",requests:value.requests,headcount:value.headcount})).sort((a,b)=>b.requests-a.requests)};
  });
}
