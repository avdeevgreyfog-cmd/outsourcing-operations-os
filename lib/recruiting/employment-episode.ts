import type {Sql} from "postgres";
import type {EmploymentRelationChoice} from "./workflow";

export class EmploymentEpisodeConflict extends Error {}

// Called inside the conversion transaction after locking the candidate and worker.
// A declared type records an episode; it does not assert that a contract is signed.
export async function ensureEmploymentEpisode(tx:Sql,actor:{organizationId:string;userId:string},workerId:string,actualStartAt:string,choice:EmploymentRelationChoice){
  if(choice==="unspecified")return null;
  const rows=await tx<Array<{id:string;relationType:string;coversStart:boolean}>>`
    SELECT id,relation_type "relationType",
      (effective_from<=(${actualStartAt}::timestamptz AT TIME ZONE 'Europe/Moscow')::date
        AND (effective_to IS NULL OR effective_to>=(${actualStartAt}::timestamptz AT TIME ZONE 'Europe/Moscow')::date)) "coversStart"
    FROM employment_relations
    WHERE organization_id=${actor.organizationId}::uuid AND worker_id=${workerId}::uuid
      AND (effective_to IS NULL OR effective_to>=(${actualStartAt}::timestamptz AT TIME ZONE 'Europe/Moscow')::date)
    ORDER BY effective_from DESC,id FOR UPDATE
  `;
  if(rows.length){
    if(rows.length===1&&rows[0].coversStart&&rows[0].relationType===choice)return rows[0].id;
    throw new EmploymentEpisodeConflict("У сотрудника уже есть другой или запланированный период оформления на эту дату. Проверьте историю сотрудника; предыдущие записи не изменены.");
  }
  const [relation]=await tx<Array<{id:string}>>`
    INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,metadata,created_by_user_id)
    VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${choice},(${actualStartAt}::timestamptz AT TIME ZONE 'Europe/Moscow')::date,
      ${tx.json({source:"candidate_first_shift"})},${actor.userId}::uuid)
    RETURNING id
  `;
  return relation.id;
}
