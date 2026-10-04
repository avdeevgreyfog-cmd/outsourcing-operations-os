import type { Actor } from "@/lib/access/types";
import { listWorkers } from "@/lib/data/service";
import { withTenant } from "@/lib/db/client";

export type WorkerActivityRow = { id:string; createdAt:string; actor:string|null; summary:string };

/** Entity history follows the same row scope as the employee directory. */
export async function listWorkerActivity(actor:Actor, workerId:string):Promise<WorkerActivityRow[]> {
  if (!(await listWorkers(actor)).some(row => row.id === workerId)) return [];
  if (actor.demo) return [];
  return withTenant(actor.organizationId, actor.userId, sql => sql<WorkerActivityRow[]>`
    SELECT e.id,to_char(e.created_at,'DD.MM.YYYY HH24:MI') "createdAt",
      u.display_name actor,e.summary
    FROM activity_events e LEFT JOIN app_users u ON u.id=e.actor_user_id
    WHERE e.organization_id=${actor.organizationId}::uuid
      AND e.entity_type='worker' AND e.entity_id=${workerId}::uuid
    ORDER BY e.created_at DESC,e.id DESC LIMIT 100
  `);
}
