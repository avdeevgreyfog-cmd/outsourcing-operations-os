import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

export type ObjectOperationalFactRow={
  id:string;
  organizationId:string;
  objectId:string;
  factKey:string;
  section:string;
  label:string;
  value:string;
  status:"proposed"|"confirmed"|"issue";
  category:string;
  audiences:string[];
  sourceKind:"request"|"site_visit"|"manual"|"system";
  sourceId:string|null;
  confirmedBy:string|null;
  confirmedAt:string|null;
};

export async function listObjectOperationalFacts(actor:Actor,objectId?:string):Promise<ObjectOperationalFactRow[]>{
  requireCapability(actor,"operations.object.read");
  if(actor.demo)return [];
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<ObjectOperationalFactRow & {
      ownerUserId:string|null;regionId:string|null;clientId:string;assigneeUserIds:string[];
    }>>`
      SELECT f.id,f.organization_id "organizationId",f.object_id "objectId",f.fact_key "factKey",f.section,f.label,
        f.value_text value,f.status,f.category,f.audiences,f.source_kind "sourceKind",f.source_id "sourceId",
        u.display_name "confirmedBy",f.confirmed_at::text "confirmedAt",
        o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM object_operational_facts f
      JOIN objects o ON o.id=f.object_id
      LEFT JOIN app_users u ON u.id=f.confirmed_by_user_id
      WHERE (${objectId??null}::uuid IS NULL OR f.object_id=${objectId??null}::uuid)
      ORDER BY f.section,f.label
    `;
    return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor));
  });
}
