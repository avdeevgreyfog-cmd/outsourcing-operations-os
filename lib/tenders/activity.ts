import type {Actor} from "@/lib/access/types";
import {withTenant} from "@/lib/db/client";

export type TenderActivityRow={id:string;verb:string;summary:string;createdAt:string;actor:string|null};
export async function listTenderActivity(actor:Actor,tenderId:string):Promise<TenderActivityRow[]>{
  if(actor.demo)return [
    {id:"demo-tender-history-1",verb:"commented",summary:"Добавлен комментарий по условиям тендера",createdAt:"09.09.2026 09:25",actor:"Илья Морозов"},
    {id:"demo-tender-history-2",verb:"created",summary:"Тендер добавлен в реестр",createdAt:"07.09.2026 12:10",actor:"Илья Морозов"},
  ];
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<TenderActivityRow[]>`
    SELECT ae.id,ae.verb,ae.summary,to_char(ae.created_at,'DD.MM.YYYY HH24:MI') "createdAt",u.display_name actor
    FROM activity_events ae LEFT JOIN app_users u ON u.id=ae.actor_user_id
    WHERE ae.entity_type='tender' AND ae.entity_id=${tenderId}::uuid ORDER BY ae.created_at DESC
  `);
}
