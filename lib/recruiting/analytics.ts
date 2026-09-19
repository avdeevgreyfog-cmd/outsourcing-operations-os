import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

export * from './analytics-engine';
import {buildPeriodAnalytics,buildSummary,calculateDemoAnalytics,type AnalyticsApplication,type AnalyticsHistory,type RecruitingAnalyticsFilters,type RecruitingAnalyticsData} from './analytics-engine';
import {listRecruitingApplications,listRecruitingNeeds,getRecruitingOptions} from './service';
export async function getRecruitingAnalytics(actor: Actor, filters: RecruitingAnalyticsFilters): Promise<RecruitingAnalyticsData> {
  requireCapability(actor,"recruiting.candidate.read");
  if(actor.demo) {const [rows,needs,options]=await Promise.all([listRecruitingApplications(actor),listRecruitingNeeds(actor),getRecruitingOptions(actor)]);return calculateDemoAnalytics(rows,filters,needs,options.exitReasons.map(x=>({code:x.code,label:x.name,count:0})));}
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const earliest=[filters.from,filters.compareFrom].sort()[0];
    const latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const rows=await sql<AnalyticsApplication[]>`
      SELECT ca.id "applicationId",ca.organization_id "organizationId",ca.object_id "objectId",n.specialty_id "specialtyId",
        COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",ca.owner_user_id "ownerUserId",
        ca.manager_user_id "managerUserId",CASE WHEN ca.source_snapshot IS NULL THEN c.source ELSE ca.source_snapshot->>'source' END source,ca.source_snapshot->>'campaign' "sourceCampaign",ca.rejection_reason_code "rejectionReasonCode",ca.stage "rawStage",ca.created_at::text "createdAt",ca.updated_at::text "updatedAt",
        ARRAY_REMOVE(ARRAY[ca.owner_user_id::text,ca.manager_user_id::text],NULL)
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM candidate_applications ca
      JOIN candidates c ON c.id=ca.candidate_id
      JOIN needs n ON n.id=ca.need_id
      LEFT JOIN objects o ON o.id=ca.object_id
      WHERE ca.created_at>=${earliest}::date AND ca.created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY ca.created_at
    `;
    const applications=rows.filter(row=>canReadRow(actor.access,"recruiting.candidate.read",row,actor)).filter(row=>(!filters.objectId||row.objectId===filters.objectId)&&(!filters.specialtyId||row.specialtyId===filters.specialtyId)&&(!filters.recruiterId||row.ownerUserId===filters.recruiterId||row.assigneeUserIds.includes(filters.recruiterId))&&(!filters.source||row.source===filters.source));
    const ids=applications.map(row=>row.applicationId);
    const history=ids.length?await sql<AnalyticsHistory[]>`
      SELECT h.application_id "applicationId",h.to_stage "toStage",h.reason_code "reasonCode",h.created_at::text "createdAt"
      FROM candidate_stage_history h
      WHERE h.application_id=ANY(${ids}::uuid[]) AND h.created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY h.application_id,h.created_at
    `:[];

    const current=buildPeriodAnalytics(applications,history,filters.from,filters.to);
    const comparison=buildPeriodAnalytics(applications,history,filters.compareFrom,filters.compareTo);
    const reasonCodes=[...current.exitReasonCounts.keys()];
    const reasonRows=reasonCodes.length?await sql<Array<{code:string;label:string}>>`
      SELECT code,name label FROM candidate_exit_reasons
      WHERE code=ANY(${reasonCodes}::text[]) AND active
    `:[];
    const reasonLabel=new Map(reasonRows.map(row=>[row.code,row.label]));
    return {
      filters,
      stages:current.stages,
      metrics:current.metrics,
      comparison:comparison.metrics,
      daily:current.daily,
      comparisonDaily:comparison.daily,
      sources:current.sources,
      exitReasons:[...current.exitReasonCounts.entries()].map(([code,count])=>({code,label:reasonLabel.get(code)??(code==="unspecified"?"Причина не указана":code),count})).sort((a,b)=>b.count-a.count),
      summary:buildSummary(current.stages),
    };
  });
}
