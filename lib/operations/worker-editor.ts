import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from 'postgres';
import type { Actor } from '@/lib/access/types';
import { AccessDeniedError, requireCapability } from '@/lib/access/server';
import { canReadRow } from '@/lib/core/access.mjs';
import { withTenant } from '@/lib/db/client';
import { listWorkers } from '@/lib/data/service';
import type { WorkerEditorContext, WorkerProfileData, WorkerEmploymentPeriod, WorkerEditEvent } from './worker-editor-types';

const nullableText=(max:number)=>z.string().trim().max(max).nullable();
export const profileSchema=z.object({
  fullName:z.string().trim().min(2).max(240),phone:nullableText(60),email:z.string().email().max(320).nullable(),
  city:nullableText(240),birthDate:z.string().date().nullable(),clothingSize:nullableText(40),shoeSize:nullableText(40),
  heightCm:z.number().int().min(100).max(250).nullable(),notes:nullableText(3000),
}).strict().refine(v=>!v.birthDate||v.birthDate<=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),{message:'Дата рождения не может быть в будущем',path:['birthDate']});
const periodSchema=z.object({id:z.string().uuid().optional(),relationType:z.enum(['employment','gph','npd','custom']),
  effectiveFrom:z.string().date(),effectiveTo:z.string().date().nullable(),contractReference:nullableText(240),
}).strict().refine(v=>!v.effectiveTo||v.effectiveTo>=v.effectiveFrom,{message:'Дата окончания не может быть раньше начала',path:['effectiveTo']});
export const workerChangeSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('profile'),expectedVersion:z.string().length(64),profile:profileSchema}).strict(),
  z.object({action:z.literal('period'),expectedVersion:z.string().length(64),period:periodSchema,reason:z.string().trim().min(3).max(1000)}).strict(),
]);
export type WorkerChange=z.infer<typeof workerChangeSchema>;
export class WorkerEditorError extends Error { constructor(message:string,public status=409){super(message);} }
const version=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type WorkerSnapshot=WorkerProfileData & {id:string;organizationId:string;status:string;updatedAt:string;createdByUserId:string;
  objectId:string|null;clientId:string|null;regionId:string|null;ownerUserId:string|null;assigneeUserIds:string[]};
type RelationSnapshot=WorkerEmploymentPeriod & {metadata:unknown};
const profileKeys=['fullName','phone','email','city','birthDate','clothingSize','shoeSize','heightCm','notes'] as const;
const profileOf=(w:WorkerSnapshot):WorkerProfileData=>Object.fromEntries(profileKeys.map(key=>[key,w[key]])) as WorkerProfileData;

async function readSnapshot(sql:Sql,actor:Actor,id:string,lock=false){
  if(lock){
    const [locked]=await sql<Array<{id:string}>>`SELECT id FROM worker_profiles WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`;
    if(!locked)throw new WorkerEditorError('Сотрудник не найден или недоступен',404);
  }
  const [worker]=await sql<WorkerSnapshot[]>`
    SELECT w.id,w.organization_id "organizationId",w.full_name "fullName",w.phone,w.email,w.city,w.birth_date::text "birthDate",
      w.clothing_size "clothingSize",w.shoe_size "shoeSize",w.height_cm "heightCm",w.notes,w.status,w.updated_at::text "updatedAt",w.created_by_user_id "createdByUserId",
      a.object_id "objectId",o.client_company_id "clientId",o.region_id "regionId",COALESCE(o.owner_user_id,a.manager_user_id) "ownerUserId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.organization_id=w.organization_id
        AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
        || ARRAY[COALESCE(o.owner_user_id,a.manager_user_id)::text] "assigneeUserIds"
    FROM worker_profiles w
    LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.organization_id=w.organization_id
      ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC,x.id LIMIT 1) a ON true
    LEFT JOIN objects o ON o.id=a.object_id AND o.organization_id=w.organization_id
    WHERE w.id=${id}::uuid AND w.organization_id=${actor.organizationId}::uuid
  `;
  if(!worker||!canReadRow(actor.access,'worker.read',worker,actor))throw new AccessDeniedError('worker.read');
  if(lock&&!canReadRow(actor.access,'worker.edit',worker,actor))throw new AccessDeniedError('worker.edit');
  const relations=await sql<RelationSnapshot[]>`
    SELECT id,relation_type "relationType",effective_from::text "effectiveFrom",effective_to::text "effectiveTo",contract_reference "contractReference",metadata
    FROM employment_relations WHERE worker_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid ORDER BY effective_from,id
  `;
  const profile=profileOf(worker);
  return {worker,relations,profile,profileVersion:version({profile,status:worker.status,updatedAt:worker.updatedAt}),relationsVersion:version({relations,status:worker.status})};
}

const fieldLabels:Record<string,string>={fullName:'ФИО',phone:'Телефон',email:'Почта',city:'Город',birthDate:'Дата рождения',clothingSize:'Размер одежды',shoeSize:'Размер обуви',heightCm:'Рост',notes:'Примечание',relationType:'Оформление',effectiveFrom:'Начало',effectiveTo:'Окончание',contractReference:'Номер / основание'};
function changeDetail(metadata?:{before?:Record<string,unknown>|Array<Record<string,unknown>>|null;after?:Record<string,unknown>|Array<Record<string,unknown>>|null}){
  const before=metadata?.before,after=metadata?.after;
  const value=(key:string,v:unknown)=>v==null||v===''?'Не указано':key==='relationType'?({employment:'Трудовой договор',gph:'ГПХ',npd:'Самозанятость',custom:'Другое'} as Record<string,string>)[String(v)]??String(v):String(v);
  const diff=(a:Record<string,unknown>|null|undefined,b:Record<string,unknown>)=>Object.entries(fieldLabels).filter(([key])=>a?.[key]!==b[key]&&(key in b||Boolean(a&&key in a))).map(([key,label])=>`${label}: ${value(key,a?.[key])} → ${value(key,b[key])}`).join('; ');
  if(Array.isArray(after))return after.map(row=>diff(Array.isArray(before)?before.find(old=>old.id===row.id):null,row)).filter(Boolean).join(' · ');
  return after&& !Array.isArray(after)?diff(before&&!Array.isArray(before)?before:null,after):'';
}

async function contextOf(sql:Sql,actor:Actor,id:string):Promise<WorkerEditorContext>{
  const snapshot=await readSnapshot(sql,actor,id);
  const rows=await sql<Array<WorkerEditEvent & {metadata?:{before?:Record<string,unknown>|Array<Record<string,unknown>>|null;after?:Record<string,unknown>|Array<Record<string,unknown>>|null}}>>`
    SELECT e.id,e.created_at::text date,e.summary,u.display_name actor,e.metadata->>'reason' reason,e.metadata
    FROM activity_events e LEFT JOIN app_users u ON u.id=e.actor_user_id
    WHERE e.organization_id=${actor.organizationId}::uuid AND e.entity_type='worker' AND e.entity_id=${id}::uuid
      AND e.verb IN ('profile_corrected','employment_period_created','employment_period_corrected','employment_period_closed') ORDER BY e.created_at DESC,e.id DESC LIMIT 50
  `;
  return {workerId:id,profile:snapshot.profile,profileVersion:snapshot.profileVersion,relationsVersion:snapshot.relationsVersion,
    relations:snapshot.relations.map(r=>({id:r.id,relationType:r.relationType,effectiveFrom:r.effectiveFrom,effectiveTo:r.effectiveTo,contractReference:r.contractReference})),canEdit:canReadRow(actor.access,'worker.edit',snapshot.worker,actor),events:rows.map(({metadata,...event})=>({...event,detail:changeDetail(metadata)}))};
}
export async function getWorkerEditorContext(actor:Actor,id:string):Promise<WorkerEditorContext>{
  requireCapability(actor,'worker.read');
  if(actor.demo){
    const worker=(await listWorkers(actor)).find(w=>w.id===id);
    if(!worker||!canReadRow(actor.access,'worker.read',worker,actor))throw new AccessDeniedError('worker.read');
    const profile:WorkerProfileData={fullName:worker.fullName,phone:worker.phone??null,email:null,city:null,birthDate:null,
      clothingSize:worker.clothingSize??null,shoeSize:worker.shoeSize??null,heightCm:worker.heightCm??null,notes:null};
    const demoType:WorkerEmploymentPeriod['relationType']|undefined=({employment:'employment',gph:'gph',npd:'npd',custom:'custom','ТК':'employment','Трудовой договор':'employment','ГПХ':'gph','Самозанятый':'npd','Самозанятость':'npd','Другое':'custom'} as Record<string,WorkerEmploymentPeriod['relationType']>)[worker.employment??''];
    const relations:WorkerEmploymentPeriod[]=demoType&&worker.startDate?[{id:worker.id,relationType:demoType,effectiveFrom:worker.startDate,effectiveTo:null,contractReference:null}]:[];
    return {workerId:id,profile,profileVersion:version(profile),relationsVersion:version(relations),relations,canEdit:canReadRow(actor.access,'worker.edit',worker,actor),events:[]};
  }
  return withTenant(actor.organizationId,actor.userId,sql=>contextOf(sql,actor,id));
}
export async function saveWorkerChange(actor:Actor,id:string,input:unknown):Promise<WorkerEditorContext>{
  requireCapability(actor,'worker.read');requireCapability(actor,'worker.edit');
  const body=workerChangeSchema.parse(input);
  if(actor.demo)throw new WorkerEditorError('В демо-режиме изменения доступны только в текущей форме');
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const snapshot=await readSnapshot(sql,actor,id,true);
    const expected=body.action==='profile'?snapshot.profileVersion:snapshot.relationsVersion;
    if(body.expectedVersion!==expected)throw new WorkerEditorError('Данные изменились после открытия формы. Ваш ввод сохранён. Загрузите актуальные данные и повторите правку.');
    let before:WorkerProfileData|WorkerEmploymentPeriod|null=null,after:WorkerProfileData|WorkerEmploymentPeriod|null=null,verb:string,summary:string,reason:string|null=null;
    if(body.action==='profile'){
      before=snapshot.profile;after=body.profile;verb='profile_corrected';summary='Изменены основные данные сотрудника';
      await sql`UPDATE worker_profiles SET full_name=${body.profile.fullName},phone=${body.profile.phone},email=${body.profile.email},city=${body.profile.city},birth_date=${body.profile.birthDate}::date,
        clothing_size=${body.profile.clothingSize},shoe_size=${body.profile.shoeSize},height_cm=${body.profile.heightCm},notes=${body.profile.notes},updated_at=clock_timestamp()
        WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid`;
    }else{
      const period=body.period;const old=period.id?snapshot.relations.find(r=>r.id===period.id):null;
      if(period.id&&!old)throw new WorkerEditorError('Период не найден или уже изменён');
      if(!old&&snapshot.worker.status==='dismissed')throw new WorkerEditorError('Для сотрудника с завершённой работой можно исправить существующий период. Новый выход подтверждается в подборе.');
      if(snapshot.relations.some(r=>r.id!==period.id&&r.effectiveFrom<=(period.effectiveTo??'9999-12-31')&&(r.effectiveTo??'9999-12-31')>=period.effectiveFrom))
        throw new WorkerEditorError('Период пересекается с существующим оформлением. Сначала явно исправьте его даты.');
      before=old?{id:old.id,relationType:old.relationType,effectiveFrom:old.effectiveFrom,effectiveTo:old.effectiveTo,contractReference:old.contractReference}:null;
      reason=body.reason;verb=old?'employment_period_corrected':'employment_period_created';summary=old?'Исправлен период оформления':'Добавлен период оформления';
      if(old){
        await sql`UPDATE employment_relations SET relation_type=${period.relationType},effective_from=${period.effectiveFrom}::date,effective_to=${period.effectiveTo}::date,contract_reference=${period.contractReference}
          WHERE id=${old.id}::uuid AND worker_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid`;
        after={...period,id:old.id};
      }else{
        const [created]=await sql<Array<{id:string}>>`INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,effective_to,contract_reference,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${period.relationType},${period.effectiveFrom}::date,${period.effectiveTo}::date,${period.contractReference},${actor.userId}::uuid) RETURNING id`;
        after={...period,id:created.id};
      }
    }
    await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
      VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,${verb},${summary},${sql.json({before,after,reason})})`;
    return contextOf(sql,actor,id);
  });
}
