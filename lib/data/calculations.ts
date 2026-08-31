import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { listCalculations } from "@/lib/data/service";

export type CommercialCalculationRow={
  id:string; calculationId:string; calculationNumber:string; origin:string; requestId:string|null; request:string; role:string; name:string; model:string; status:string;
  scenarioNumber:number; calculationMode:string; workerNet:number|string; totalCost:number|string; clientRate:number|string; marginPct:number|string; monthlyContribution:number|string;
};

export async function listCommercialCalculations(actor:Actor):Promise<CommercialCalculationRow[]>{
  if(actor.demo){const rows=await listCalculations(actor);return rows.map((row,index)=>({id:row.id,calculationId:row.id,calculationNumber:`Р-ДЕМО-${String(index+1).padStart(3,"0")}`,origin:"request",requestId:row.requestId,request:row.request,role:row.role,name:row.name,model:row.model,status:row.status,scenarioNumber:1,calculationMode:"target_margin",workerNet:row.workerNet,totalCost:row.totalCost,clientRate:row.clientRate,marginPct:row.marginPct,monthlyContribution:row.monthlyContribution}));}
  requireCapability(actor,"calculation.scenario.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CommercialCalculationRow[]>`
    SELECT cs.id,c.id "calculationId",c.calculation_number "calculationNumber",c.origin,c.request_id "requestId",COALESCE(r.title,'Самостоятельный расчёт') request,
      COALESCE(s.name,'Все позиции') role,cs.name,cm.name model,cs.status,cs.scenario_number "scenarioNumber",cs.calculation_mode "calculationMode",
      COALESCE((cs.inputs_snapshot->>'workerNetHourly')::numeric,0) "workerNet",COALESCE((cs.result_snapshot->>'totalCostHourly')::numeric,0) "totalCost",
      COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,0) "clientRate",COALESCE((cs.result_snapshot->>'marginPct')::numeric,0) "marginPct",
      COALESCE((cs.result_snapshot->>'monthlyContribution')::numeric,0) "monthlyContribution"
    FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id LEFT JOIN requests r ON r.id=c.request_id
    LEFT JOIN request_roles rr ON rr.id=cs.request_role_id LEFT JOIN specialties s ON s.id=rr.specialty_id JOIN calculation_models cm ON cm.id=cs.model_id
    ORDER BY cs.created_at DESC`);
}
