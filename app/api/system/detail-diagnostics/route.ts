import { NextResponse } from "next/server";
import { getCurrentActor,getWorkspaceContext } from "@/lib/auth/server";
import { listCandidates,listFinance,listIncidents,listLaunchTasks,listNeeds,listObjects,listShifts,listWorkers } from "@/lib/data/service";
import { getHousingSnapshot,getInventorySnapshot,getObjectContacts,getOperationsReferenceData,getWorkerOffboardingContext,getWorkerOperationsDetails,listOperationsAnalytics,listStaffingForecast,listSupplyRequests } from "@/lib/operations/service";

type Check={name:string;ok:boolean;message?:string};
async function run(checks:Check[],name:string,task:()=>Promise<unknown>){
  try{await task();checks.push({name,ok:true});}
  catch(error){checks.push({name,ok:false,message:error instanceof Error?error.message:String(error)});}
}

export async function GET(){
  const actor=await getCurrentActor({ignorePreview:true});
  if(!actor?.demo)return NextResponse.json({error:"Not found"},{status:404});
  const objectId="80000000-0000-4000-8000-000000000001";
  const workerId="88000000-0000-4000-8000-000000000001";
  const checks:Check[]=[];
  await run(checks,"workspace",()=>getWorkspaceContext(actor));
  await run(checks,"objects",()=>listObjects(actor));
  await run(checks,"needs",()=>listNeeds(actor));
  await run(checks,"workers",()=>listWorkers(actor));
  await run(checks,"shifts",()=>listShifts(actor));
  await run(checks,"finance",()=>listFinance(actor));
  await run(checks,"candidates",()=>listCandidates(actor));
  await run(checks,"launchTasks",()=>listLaunchTasks(actor));
  await run(checks,"incidents",()=>listIncidents(actor));
  await run(checks,"analytics",()=>listOperationsAnalytics(actor));
  await run(checks,"forecast",()=>listStaffingForecast(actor,30));
  await run(checks,"inventory",()=>getInventorySnapshot(actor));
  await run(checks,"housing",()=>getHousingSnapshot(actor));
  await run(checks,"supplyRequests",()=>listSupplyRequests(actor));
  await run(checks,"objectContacts",()=>getObjectContacts(actor,objectId));
  await run(checks,"workerDetails",()=>getWorkerOperationsDetails(actor,workerId));
  await run(checks,"workerOffboarding",()=>getWorkerOffboardingContext(actor,workerId));
  await run(checks,"operationsReference",()=>getOperationsReferenceData(actor));
  return NextResponse.json({ok:checks.every(item=>item.ok),checks},{status:checks.every(item=>item.ok)?200:500});
}
