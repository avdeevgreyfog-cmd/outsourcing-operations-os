import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

export type CommercialFormOptions={clients:Array<{id:string;name:string;inn?:string|null}>;regions:Array<{id:string;name:string}>;specialties:Array<{id:string;name:string}>};

export async function getCommercialFormOptions(actor:Actor):Promise<CommercialFormOptions>{
 requireCapability(actor,"sales.request.create");
 if(actor.demo)return {
  clients:[{id:"70000000-0000-4000-8000-000000000001",name:"NordLog",inn:"7700000101"},{id:"70000000-0000-4000-8000-000000000002",name:"FormaBath",inn:"4000000202"},{id:"70000000-0000-4000-8000-000000000003",name:"CityPack"}],
  regions:[{id:"30000000-0000-4000-8000-000000000001",name:"Москва и МО"},{id:"30000000-0000-4000-8000-000000000002",name:"Калужская область"}],
  specialties:[{id:"60000000-0000-4000-8000-000000000001",name:"Комплектовщик"},{id:"60000000-0000-4000-8000-000000000002",name:"Грузчик"},{id:"60000000-0000-4000-8000-000000000003",name:"Сборщик мебели"}],
 };
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  const [clients,regions,specialties]=await Promise.all([
   sql<Array<{id:string;name:string;inn:string|null}>>`SELECT id,name,inn FROM client_companies WHERE status='active' ORDER BY name`,
   sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
   sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active=true ORDER BY name`,
  ]);
  return {clients,regions,specialties};
 });
}
