import type {Sql} from "postgres";
import {resolveObjectConditionInTransaction} from "@/lib/operations/object-conditions";

/** A forecast only. Actual accruals are captured on time entries, never here. */
export async function plannedShiftCost(sql:Sql,organizationId:string,input:{objectId:string;specialtyId:string;date:string;shiftKind:string;physicalHours:number;workerIds:string[]}){
 if(!input.workerIds.length)return 0;
 const condition=await resolveObjectConditionInTransaction(sql,organizationId,input);
 const rows=await sql<Array<{amount:number|string|null;unit:string|null;paidHours:number|string|null;sourceConditionId:string|null;paidHoursOverride:boolean}>>`SELECT r.amount,r.unit,a.paid_hours_per_shift "paidHours",a.source_condition_id "sourceConditionId",a.paid_hours_override "paidHoursOverride"
 FROM worker_profiles w
 LEFT JOIN LATERAL(SELECT * FROM worker_object_assignments a WHERE a.organization_id=w.organization_id AND a.worker_id=w.id AND a.object_id=${input.objectId}::uuid AND a.specialty_id=${input.specialtyId}::uuid AND(a.effective_from IS NULL OR a.effective_from<=${input.date}::date) AND(a.effective_to IS NULL OR a.effective_to>=${input.date}::date) ORDER BY a.effective_from DESC NULLS LAST LIMIT 1)a ON true
 LEFT JOIN LATERAL(SELECT amount,unit FROM worker_rates r WHERE r.organization_id=w.organization_id AND r.worker_id=w.id AND r.object_id=${input.objectId}::uuid AND(r.specialty_id=${input.specialtyId}::uuid OR r.specialty_id IS NULL) AND r.effective_from<=${input.date}::date AND(r.effective_to IS NULL OR r.effective_to>=${input.date}::date) AND r.day_night IN(${input.shiftKind},'any') ORDER BY (r.day_night=${input.shiftKind}) DESC,r.effective_from DESC LIMIT 1)r ON true
 WHERE w.organization_id=${organizationId}::uuid AND w.id=ANY(${input.workerIds}::uuid[])`;
 return rows.reduce((sum,row)=>{const amount=row.amount==null?condition?.baseRate:Number(row.amount),unit=row.unit??condition?.paymentUnit;if(amount==null||unit==null)return sum;const paid=(row.paidHoursOverride||!row.sourceConditionId)&&row.paidHours!=null?Number(row.paidHours):condition?.paidHours??(row.paidHours==null?input.physicalHours:Number(row.paidHours));return sum+(unit==='hour'?amount*paid:unit==='shift'?amount:unit==='month'?amount/22:0)},0);
}
