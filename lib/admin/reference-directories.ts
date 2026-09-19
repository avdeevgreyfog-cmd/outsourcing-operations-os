import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

export type ReferenceRegion={id:string;code:string;name:string};
export type ReferenceSpecialty={id:string;code:string;name:string;aliases:string[];active:boolean};

export async function listReferenceDirectories(actor:Actor){
  requireCapability(actor,"admin.permissions.manage");
  if(actor.demo){
    return {
      regions:[
        {id:"30000000-0000-4000-8000-000000000001",code:"moscow",name:"Москва и МО"},
        {id:"30000000-0000-4000-8000-000000000002",code:"kaluga",name:"Калужская область"},
      ] satisfies ReferenceRegion[],
      specialties:[
        {id:"60000000-0000-4000-8000-000000000001",code:"picker",name:"Комплектовщик",aliases:[],active:true},
        {id:"60000000-0000-4000-8000-000000000002",code:"loader",name:"Грузчик",aliases:[],active:true},
        {id:"60000000-0000-4000-8000-000000000003",code:"assembler",name:"Сборщик мебели",aliases:[],active:true},
      ] satisfies ReferenceSpecialty[],
    };
  }
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [regions,specialties]=await Promise.all([
      sql<ReferenceRegion[]>`SELECT id,code,name FROM regions ORDER BY name`,
      sql<ReferenceSpecialty[]>`SELECT id,code,name,aliases,active FROM specialties ORDER BY active DESC,name`,
    ]);
    return {regions,specialties};
  });
}
