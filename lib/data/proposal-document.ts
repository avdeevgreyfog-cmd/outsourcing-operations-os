import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

export type ProposalDocument={id:string;proposalNumber:string;version:number;status:string;createdAt:string;validUntil:string|null;client:string;requestTitle:string;siteName:string|null;location:string|null;schedule:Record<string,unknown>;provision:Record<string,unknown>;terms:Record<string,unknown>;positions:Array<{name:string;count:number;clientRate:number|string;vatMode:string|null;scheduleType:string|null;paidHours:number|string|null}>};
export async function getProposalDocument(actor:Actor,id:string):Promise<ProposalDocument|null>{
  requireCapability(actor,"sales.proposal.read");
  if(actor.demo)return null;
  return withTenant(actor.organizationId,actor.userId,async sql=>{const [row]=await sql<ProposalDocument[]>`
    SELECT p.id,p.proposal_number "proposalNumber",p.version,p.status,to_char(p.created_at,'DD.MM.YYYY') "createdAt",to_char(p.valid_until,'DD.MM.YYYY') "validUntil",
      COALESCE(c.name,'Не указана') client,r.title "requestTitle",r.site_name "siteName",r.location_text location,r.schedule_json schedule,r.provision_json provision,p.terms_snapshot terms,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',s.name,'count',rr.count_required,'clientRate',COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,rr.target_client_rate,0),'vatMode',r.vat_mode,'scheduleType',rr.schedule_type,'paidHours',rr.paid_hours) ORDER BY s.name)
        FROM calculation_scenarios cs JOIN request_roles rr ON rr.id=cs.request_role_id JOIN specialties s ON s.id=rr.specialty_id WHERE cs.id=ANY(p.scenario_ids)),'[]'::jsonb) positions
    FROM proposals p JOIN requests r ON r.id=p.request_id LEFT JOIN client_companies c ON c.id=r.client_company_id WHERE p.id=${id}::uuid`;
    return row??null;});
}
