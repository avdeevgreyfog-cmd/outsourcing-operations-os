import {createHash} from 'node:crypto';
import type {Sql} from 'postgres';

export class ObjectSettingsConflict extends Error {}
export type ObjectManagerOption={id:string;name:string};
export const objectEditVersion=(updatedAt:string)=>createHash('sha256').update(updatedAt).digest('hex');

// Eligibility preserves the existing creation and editing criteria. It describes
// whom an authorized caller can assign, and does not grant the caller permission.
export async function listEligibleObjectManagers(tx:Sql,organizationId:string,userIds?:string[]):Promise<ObjectManagerOption[]>{
  if(userIds?.length===0)return [];
  return tx<ObjectManagerOption[]>`
    SELECT DISTINCT m.user_id id,u.display_name name
    FROM organization_memberships m JOIN app_users u ON u.id=m.user_id
    LEFT JOIN role_templates rt ON rt.id=m.role_template_id AND rt.organization_id=m.organization_id
    WHERE m.organization_id=${organizationId}::uuid AND m.status='active'
      AND (${userIds===undefined} OR m.user_id=ANY(${userIds??[]}::uuid[]))
      AND (
        rt.code IN ('director','object_manager','regional_manager','operations_head')
        OR EXISTS(SELECT 1 FROM permission_grants pg WHERE pg.organization_id=m.organization_id
          AND pg.role_template_id=m.role_template_id AND pg.capability='operations.object.edit' AND pg.effect='allow')
        OR EXISTS(
          SELECT 1 FROM position_assignments pa
          JOIN staff_positions sp ON sp.id=pa.staff_position_id AND sp.organization_id=m.organization_id
          JOIN positions p ON p.id=sp.job_profile_id AND p.organization_id=m.organization_id
          WHERE pa.membership_id=m.id AND pa.organization_id=m.organization_id AND pa.status<>'ended'
            AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
            AND (p.code IN ('object-manager','object_manager') OR EXISTS(
              SELECT 1 FROM position_permission_grants ppg WHERE ppg.position_id=sp.job_profile_id
                AND ppg.organization_id=m.organization_id AND ppg.capability='operations.object.edit' AND ppg.effect='allow'))
        )
      ) ORDER BY name
  `;
}
export async function assertEligibleObjectManagers(tx:Sql,organizationId:string,userIds:string[]){
  const ids=[...new Set(userIds)],eligible=await listEligibleObjectManagers(tx,organizationId,ids);
  if(ids.some(id=>!eligible.some(row=>row.id===id)))throw new ObjectSettingsConflict('Один из выбранных менеджеров недоступен для назначения на объект. Проверьте выбранных сотрудников.');
}
