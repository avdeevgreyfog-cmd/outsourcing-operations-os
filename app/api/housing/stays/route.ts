import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({workerId:z.string().uuid(),siteId:z.string().uuid(),unitId:z.string().uuid().nullable().optional(),bedLabel:z.string().trim().max(80).nullable().optional(),checkIn:z.string().date(),checkOut:z.string().date().nullable().optional()});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments wa WHERE wa.worker_id=w.id AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date) ORDER BY wa.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id
        WHERE w.id=${body.workerId}::uuid
      `;
      if(!worker||!worker.objectId||!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,objectId:worker.objectId,ownerUserId:worker.ownerUserId,regionId:worker.regionId,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");
      const [site]=await tx<Array<{id:string;organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];capacity:number}>>`
        SELECT hs.id,hs.organization_id "organizationId",hs.primary_object_id "objectId",
          COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds",
          COALESCE((SELECT sum(hu.capacity)::int FROM housing_units hu WHERE hu.site_id=hs.id AND hu.active),0)::int capacity
        FROM housing_sites hs LEFT JOIN objects o ON o.id=hs.primary_object_id
        WHERE hs.id=${body.siteId}::uuid AND hs.active
      `;
      if(!site)throw new Error("Место проживания не найдено");
      if(!canReadRow(actor.access,"supply.housing.manage",{...site,objectId:site.objectId??undefined,ownerUserId:site.ownerUserId??undefined,regionId:site.regionId??undefined},actor))throw new AccessDeniedError("supply.housing.manage");
      if(body.unitId){
        const [unit]=await tx<Array<{id:string}>>`SELECT id FROM housing_units WHERE id=${body.unitId}::uuid AND site_id=${body.siteId}::uuid AND active`;
        if(!unit)throw new Error("Комната или блок не найдены в выбранном жилье");
      }
      const [occupancy]=await tx<Array<{count:number}>>`
        SELECT count(*)::int count FROM housing_stays st
        WHERE st.site_id=${body.siteId}::uuid AND st.status IN ('planned','active')
          AND st.check_in<=COALESCE(${body.checkOut??null}::date,'infinity'::date)
          AND COALESCE(st.check_out,'infinity'::date)>=${body.checkIn}::date
      `;
      if((occupancy?.count??0)>=site.capacity)throw new Error("В выбранном жилье нет свободных мест на этот период");
      const [active]=await tx<Array<{id:string}>>`SELECT id FROM housing_stays WHERE worker_id=${body.workerId}::uuid AND status IN ('planned','active') LIMIT 1`;
      if(active)throw new Error("У сотрудника уже есть активное или плановое заселение");
      const [stay]=await tx<Array<{id:string}>>`
        INSERT INTO housing_stays(organization_id,worker_id,object_id,site_id,unit_id,bed_label,check_in,check_out,status,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.workerId}::uuid,${worker.objectId}::uuid,${body.siteId}::uuid,${body.unitId??null}::uuid,${body.bedLabel??null},${body.checkIn}::date,${body.checkOut??null}::date,CASE WHEN ${body.checkIn}::date<=current_date THEN 'active' ELSE 'planned' END,${actor.userId}::uuid)
        RETURNING id
      `;return stay;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные заселения",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось заселить сотрудника"},{status:500});
  }
}
