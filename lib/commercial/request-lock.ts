import type {Sql} from 'postgres';
import type {Actor} from '@/lib/access/types';

export class CommercialRequestConflict extends Error {}
import {isRequestCommercialLocked} from './request-lock-state';
// Call before locking proposal/approval/submission rows. Authorization remains
// action-specific in callers; this guard cannot grant write permission.
export async function assertRequestCommercialEditable(tx:Sql,actor:Pick<Actor,'organizationId'>,id:string){
  const [row]=await tx<Array<{status:string;archivedAt:string|null;updatedAt:string}>>`
    SELECT status,archived_at::text "archivedAt",updated_at::text "updatedAt" FROM requests
    WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE
  `;
  if(!row)throw new CommercialRequestConflict('Заявка не найдена или недоступна');
  const [accepted]=await tx<Array<{id:string}>>`
    SELECT id FROM proposals WHERE request_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid
      AND accepted_at IS NOT NULL ORDER BY accepted_at,id LIMIT 1
  `;
  if(row.archivedAt)throw new CommercialRequestConflict('Сначала восстановите заявку из архива');
  if(accepted||isRequestCommercialLocked(row))throw new CommercialRequestConflict('Коммерческие условия приняты и зафиксированы. Изменение требует отдельного согласования новой версии.');
  return row;
}
