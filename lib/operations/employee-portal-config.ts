import type {Sql} from "postgres";

export const portalSectionKeys=["shifts","confirm","decline","scheduleChanges","hours","timesheet","documents","employment","workwear","contacts","objectInfo","payAdjustments","suggestDaysOff"] as const;
export type PortalSection=typeof portalSectionKeys[number];
export type PortalSections=Record<PortalSection,boolean>;
export type PortalConfiguration={
 managerName:string|null;managerPhone:string|null;contactMethod:string|null;instruction:string;showWorkInstruction:boolean;
 timezone:string;validDays:number;autoRevokeOnExit:boolean;sections:PortalSections;
};
export type PortalConfigurationPatch=Partial<Omit<PortalConfiguration,"sections">>&{sections?:Partial<PortalSections>};

export const defaultPortalConfiguration:PortalConfiguration={
 managerName:null,managerPhone:null,contactMethod:null,
 instruction:"",showWorkInstruction:false,
 timezone:"Europe/Moscow",validDays:30,autoRevokeOnExit:true,
 sections:{shifts:true,confirm:true,decline:true,scheduleChanges:true,hours:true,timesheet:true,
   documents:false,employment:true,workwear:true,contacts:true,objectInfo:false,payAdjustments:false,suggestDaysOff:false}
};
export function normalizePortalPatch(value:unknown):PortalConfigurationPatch{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Некорректные настройки кабинета");
 const v=value as Record<string,unknown>,out:PortalConfigurationPatch={};
 const strings=["managerName","managerPhone","contactMethod","instruction"] as const;
 const limits={managerName:120,managerPhone:50,contactMethod:120,instruction:2000};
 for(const key of strings)if(key in v){
   const item=v[key];if(item!==null&&(typeof item!=="string"||item.length>limits[key]))throw new Error("Проверьте поле "+key);
   (out as Record<string,unknown>)[key]=item===null?null:item.trim();
 }
 if("timezone" in v){
   if(typeof v.timezone!=="string"||v.timezone.length>80)throw new Error("Некорректный часовой пояс");
   try{new Intl.DateTimeFormat("en-US",{timeZone:v.timezone});}catch{throw new Error("Неизвестный часовой пояс");}
   out.timezone=v.timezone;
 }
 if("showWorkInstruction" in v){
   if(typeof v.showWorkInstruction!=="boolean")throw new Error("Некорректная настройка рабочей инструкции");
   out.showWorkInstruction=v.showWorkInstruction;
 }
 if("validDays" in v){
   if(typeof v.validDays!=="number"||!Number.isInteger(v.validDays)||v.validDays<1||v.validDays>365)throw new Error("Срок ссылки: 1–365 дней");
   out.validDays=v.validDays;
 }
 if("autoRevokeOnExit" in v){
   if(typeof v.autoRevokeOnExit!=="boolean")throw new Error("Некорректное правило отзыва");
   out.autoRevokeOnExit=v.autoRevokeOnExit;
 }
 if("sections" in v){
   if(!v.sections||typeof v.sections!=="object"||Array.isArray(v.sections))throw new Error("Некорректные разделы");
   const raw=v.sections as Record<string,unknown>,sections:Partial<PortalSections>={};
   for(const key of portalSectionKeys)if(key in raw){
     if(typeof raw[key]!=="boolean")throw new Error("Некорректная видимость раздела");
     sections[key]=raw[key] as boolean;
   }
   if(Object.keys(raw).some(k=>!portalSectionKeys.includes(k as PortalSection)))throw new Error("Неизвестный раздел");
   out.sections=sections;
 }
 if(Object.keys(v).some(k=>!["managerName","managerPhone","contactMethod","instruction","timezone","validDays","autoRevokeOnExit","showWorkInstruction","sections"].includes(k)))throw new Error("Неизвестная настройка кабинета");
 return out;
}
export function applyPortalPatch(base:PortalConfiguration,patch:PortalConfigurationPatch):PortalConfiguration{
 return {...base,...patch,sections:{...base.sections,...patch.sections}};
}
export function resolvePortalConfiguration(patches:PortalConfigurationPatch[]):PortalConfiguration{
 return patches.reduce(applyPortalPatch,defaultPortalConfiguration);
}
export async function loadPortalOverrides(sql:Sql,organizationId:string,objectId?:string,workerId?:string){
 const ids=[organizationId,...(objectId?[objectId]:[]),...(workerId?[workerId]:[])];
 const rows=await sql<Array<{scope:"organization"|"object"|"worker";scopeId:string;config:PortalConfigurationPatch}>>`
   SELECT scope,scope_id "scopeId",config FROM employee_portal_config_overrides
   WHERE organization_id=${organizationId}::uuid AND scope_id=ANY(${ids}::uuid[])`;
 const lookup=(scope:string,id?:string)=>rows.find(r=>r.scope===scope&&r.scopeId===id)?.config??{};
 return {organization:lookup("organization",organizationId),object:lookup("object",objectId),worker:lookup("worker",workerId)};
}
export async function effectivePortalConfiguration(sql:Sql,organizationId:string,objectId:string,workerId:string,issuePatch?:PortalConfigurationPatch){
 const overrides=await loadPortalOverrides(sql,organizationId,objectId,workerId);
 const [legacy]=await sql<Array<{timezone:string|null;managerPhone:string|null;managerName:string|null;documents:boolean;workwear:boolean}>>`
 SELECT s.timezone,s.manager_phone "managerPhone",u.display_name "managerName",s.show_employee_documents documents,s.show_employee_workwear workwear
 FROM objects o
 LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id
 LEFT JOIN LATERAL (SELECT manager_user_id FROM worker_object_assignments WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid
  AND (effective_from IS NULL OR effective_from<=current_date) AND (effective_to IS NULL OR effective_to>=current_date) ORDER BY effective_from DESC LIMIT 1) a ON true
 LEFT JOIN app_users u ON u.id=COALESCE(a.manager_user_id,o.owner_user_id)
 WHERE o.id=${objectId}::uuid`;
 const fallback:PortalConfigurationPatch=legacy?{
  ...(legacy.managerPhone?{managerPhone:legacy.managerPhone}:{}),
  ...(legacy.managerName?{managerName:legacy.managerName}:{}),
  ...(legacy.timezone&&legacy.timezone!=="Europe/Moscow"?{timezone:legacy.timezone}:{}),
  sections:{...(legacy.documents===false?{documents:false}:{}),...(legacy.workwear===false?{workwear:false}:{})}
 }:{};
 return resolvePortalConfiguration([overrides.organization,fallback,overrides.object,overrides.worker,issuePatch??{}]);
}

/** Live inheritance: an issued link overrides only keys explicitly changed on issuance. */
export function diffPortalConfiguration(base:PortalConfiguration,issued:PortalConfigurationPatch):PortalConfigurationPatch{
 const full=applyPortalPatch(base,issued),patch:PortalConfigurationPatch={};
 for(const key of ["managerName","managerPhone","contactMethod","instruction","timezone","validDays","autoRevokeOnExit","showWorkInstruction"] as const){
   if(full[key]!==base[key])Object.assign(patch,{[key]:full[key]});
 }
 const sections:Partial<PortalSections>={};
 for(const key of portalSectionKeys)if(full.sections[key]!==base.sections[key])sections[key]=full.sections[key];
 if(Object.keys(sections).length)patch.sections=sections;
 return patch;
}
export async function effectiveActiveLinkConfiguration(sql:Sql,organizationId:string,objectId:string,workerId:string,linkOverride?:PortalConfigurationPatch){
 return effectivePortalConfiguration(sql,organizationId,objectId,workerId,linkOverride??{});
}
