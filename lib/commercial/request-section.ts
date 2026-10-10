import {normalizeRequestIntake,type RequestIntake} from "@/lib/commercial/request-intake";
export type RequestEditSection="quick"|"general"|"need"|"schedule"|"provision"|"compliance"|"commercial";
export const requestSectionIntakeKeys:Record<RequestEditSection,Array<keyof RequestIntake>>={quick:["contact"],general:["companyName","contact","object"],need:["volume"],schedule:["schedule"],provision:["provision","logistics"],compliance:["compliance"],commercial:["commercial"]};
export const requestSectionFields:Record<RequestEditSection,string[]>={quick:["title","startDate","ownerUserId"],general:["title","source","clientId","location","regionId","startDate","durationText"],need:["roles","startDate","durationText"],schedule:["schedule","lunchPaid"],provision:[],compliance:[],commercial:["vatMode","comments","ownerUserId","observerUserIds"]};
function preserveExtraValues(previous:unknown,next:unknown):unknown{
 if(previous&&next&&typeof previous==="object"&&typeof next==="object"&&!Array.isArray(previous)&&!Array.isArray(next)){
  const result={...(previous as Record<string,unknown>)};for(const [key,value] of Object.entries(next))result[key]=preserveExtraValues(result[key],value);return result;
 }
 return next;
}
export function mergeRequestSection<T extends {intake:unknown}>(current:T,submitted:T,section:RequestEditSection):T{
  const next={...current};
  for(const key of requestSectionFields[section]){(next as Record<string,unknown>)[key]=(submitted as Record<string,unknown>)[key];}
  const oldIntake=normalizeRequestIntake(current.intake),newIntake=normalizeRequestIntake(submitted.intake);
  const intake=preserveExtraValues(current.intake,oldIntake) as RequestIntake;
  for(const key of requestSectionIntakeKeys[section]){(intake as Record<string,unknown>)[key]=preserveExtraValues((intake as Record<string,unknown>)[key],newIntake[key]);}
  return {...next,intake};
}
