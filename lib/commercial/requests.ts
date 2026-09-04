import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type CommercialRequestRow={
  id:string;organizationId:string;title:string;client:string;clientId:string|null;status:string;location:string;regionId:string|null;
  ownerUserId:string|null;createdByUserId:string;teamId:string|null;start:string|null;roles:Array<{name:string;count:number}>;source:string;archivedAt:string|null;
};

export async function listCommercialRequests(actor:Actor):Promise<CommercialRequestRow[]>{
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return demo.requests.map(item=>({...item,clientId:item.clientId??null,start:item.start??null,source:"manual",archivedAt:null})) as CommercialRequestRow[];
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialRequestRow[]>`
      SELECT r.id,r.organization_id "organizationId",r.title,COALESCE(c.name,'Без клиента') client,r.client_company_id "clientId",r.status,
        r.location_text location,r.region_id "regionId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
        r.expected_start_date::text start,r.source,r.archived_at::text "archivedAt",
        COALESCE(jsonb_agg(jsonb_build_object('name',s.name,'count',rr.count_required) ORDER BY rr.created_at) FILTER(WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
      FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id
      LEFT JOIN request_roles rr ON rr.request_id=r.id LEFT JOIN specialties s ON s.id=rr.specialty_id
      GROUP BY r.id,c.name ORDER BY r.status='archived',r.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor));
  });
}
