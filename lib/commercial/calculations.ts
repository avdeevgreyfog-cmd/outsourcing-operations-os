import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type CalculationCoverageRow={requestRoleId:string;scenarioId:string;status:string};

export async function getRequestCalculationCoverage(actor:Actor,requestId:string):Promise<CalculationCoverageRow[]>{
  requireCapability(actor,"calculation.scenario.read");
  if(actor.demo){
    const request=demo.requests.find(item=>item.id===requestId);
    if(!request)return [];
    const ids=requestId==="73000000-0000-4000-8000-000000000001"
      ?["74000000-0000-4000-8000-000000000001","74000000-0000-4000-8000-000000000002"]
      :request.roles.map((_,index)=>`74000000-0000-4000-8000-0000000001${index+10}`);
    return request.roles.flatMap((role,index)=>{
      const scenario=demo.calculations.find(item=>item.requestId===requestId&&item.role===role.name&&item.status==="accepted");
      return scenario?[{requestRoleId:ids[index],scenarioId:scenario.id,status:scenario.status}]:[];
    });
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CalculationCoverageRow[]>`
    SELECT DISTINCT ON (cs.request_role_id) cs.request_role_id "requestRoleId",cs.id "scenarioId",cs.status
    FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
    WHERE c.request_id=${requestId}::uuid AND cs.status='accepted'
    ORDER BY cs.request_role_id,cs.accepted_at DESC NULLS LAST,cs.created_at DESC
  `);
}
