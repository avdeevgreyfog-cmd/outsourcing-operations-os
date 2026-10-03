import type {Actor} from "@/lib/access/types";
import {getTimesheet,listWorkers,type TimesheetCellValue} from "@/lib/data/service";
import {getWorkerOperationsDetails} from "@/lib/operations/service";
import {requireCapability} from "@/lib/access/server";
import {validTimesheetMonth,summarizeWorkerTimesheet} from "./worker-timesheet.mjs";
export type PersonalTimesheet={month:string;objects:{objectId:string;object:string;status:string;rows:{dayCells:Record<string,TimesheetCellValue>;nightCells:Record<string,TimesheetCellValue>}[]}[];summary:{hours:number;shifts:number;dayShifts:number;nightShifts:number;workedDays:number}};
export async function getWorkerTimesheet(actor:Actor,workerId:string,month:string):Promise<PersonalTimesheet|null>{
 requireCapability(actor,"time.timesheet.read");
 if(!validTimesheetMonth(month))throw new Error("Некорректный месяц");
 const worker=(await listWorkers(actor)).find(row=>row.id===workerId);if(!worker)return null;
 const details=await getWorkerOperationsDetails(actor,workerId);
 const objectIds=new Set(details.assignments.filter(row=>{const from=row.effectiveFrom.includes(".")?row.effectiveFrom.split(".").reverse().join("-"):row.effectiveFrom;const to=row.effectiveTo?.includes(".")?row.effectiveTo.split(".").reverse().join("-"):row.effectiveTo;return from.slice(0,7)<=month&&(!to||to.slice(0,7)>=month)}).map(row=>row.objectId));
 if(worker.objectId)objectIds.add(worker.objectId);
 const sheets=await Promise.all([...objectIds].map(objectId=>getTimesheet(actor,{objectId,month})));
 const objects=sheets.flatMap(sheet=>{
  if(!sheet)return [];
  const rows=sheet.rows.filter(row=>row.workerId===workerId&&row.rowKind!=="candidate").map(row=>({dayCells:row.dayCells??{},nightCells:row.nightCells??{}}));
  return rows.length?[{objectId:sheet.objectId,object:sheet.object,status:sheet.status,rows}]:[];
 });
 return {month,objects,summary:summarizeWorkerTimesheet(objects)};
}
