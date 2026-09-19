import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

export type RecruitingMetricFormat="number"|"percent"|"days"|"hours";
export type RecruitingMetricDirection="higher"|"lower"|"neutral";
export type RecruitingMetricKey=
  |"staffing_deficit"
  |"staffing_coverage"
  |"staffing_required"
  |"staffing_working"
  |"total_candidates"
  |"conversion_to_start"
  |"in_work"
  |"ready"
  |"started"
  |"avg_days_to_start"
  |"avg_first_contact_hours"
  |"overdue_first_contact"
  |"rejected"
  |"no_show";

export type RecruitingMetricDefinition={
  key:RecruitingMetricKey;
  label:string;
  description:string;
  format:RecruitingMetricFormat;
  direction:RecruitingMetricDirection;
  comparison:boolean;
  defaultVisible:boolean;
  defaultPosition:number;
};

export type RecruitingMetricPreference={
  key:RecruitingMetricKey;
  label:string;
  visible:boolean;
  position:number;
  targetValue:number|null;
};

export const recruitingMetricCatalog:RecruitingMetricDefinition[]=[
  {key:"staffing_deficit",label:"Нужно найти",description:"Остаток плановой численности с учётом фактически работающих.",format:"number",direction:"lower",comparison:false,defaultVisible:true,defaultPosition:10},
  {key:"staffing_coverage",label:"Закрытие потребности",description:"Доля фактически работающих от плановой численности.",format:"percent",direction:"higher",comparison:false,defaultVisible:true,defaultPosition:20},
  {key:"started",label:"Вышли на работу",description:"Кандидаты выбранного периода, дошедшие до фактического выхода.",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:30},
  {key:"conversion_to_start",label:"Конверсия до выхода",description:"Доля кандидатов периода, дошедших до фактического выхода.",format:"percent",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:40},
  {key:"avg_first_contact_hours",label:"Время до первого контакта",description:"Среднее время от попадания кандидата в подбор до первого контакта.",format:"hours",direction:"lower",comparison:true,defaultVisible:true,defaultPosition:50},
  {key:"ready",label:"Готовы к выходу",description:"Кандидаты, которые на конец периода находятся на этапе готовности к выходу.",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:60},
  {key:"overdue_first_contact",label:"Без контакта > 4 ч",description:"Новые кандидаты, с которыми не связались в течение четырёх часов.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:70},
  {key:"total_candidates",label:"Кандидаты за период",description:"Все кандидаты, попавшие в подбор за выбранный период.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:80},
  {key:"in_work",label:"В работе на конец периода",description:"Активные кандидаты, ещё не вышедшие и не выбывшие к концу периода.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:90},
  {key:"avg_days_to_start",label:"Среднее время до выхода",description:"Среднее время от попадания кандидата в подбор до фактического выхода.",format:"days",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:100},
  {key:"rejected",label:"Отказы",description:"Кандидаты периода, завершившие подбор отказом.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:110},
  {key:"no_show",label:"Не вышли",description:"Кандидаты периода, которые были готовы, но не вышли на работу.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:120},
  {key:"staffing_required",label:"Плановая численность",description:"Суммарный план по активным потребностям в выбранном контуре.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:130},
  {key:"staffing_working",label:"Фактически работают",description:"Количество действующих сотрудников на выбранных объектах и специальностях.",format:"number",direction:"higher",comparison:false,defaultVisible:false,defaultPosition:140},
];

const catalogByKey=new Map(recruitingMetricCatalog.map(item=>[item.key,item]));

export function isRecruitingMetricKey(value:string):value is RecruitingMetricKey{return catalogByKey.has(value as RecruitingMetricKey)}
export function recruitingMetricDefinition(key:RecruitingMetricKey){return catalogByKey.get(key)!}

export function defaultRecruitingMetricPreferences():RecruitingMetricPreference[]{
  return recruitingMetricCatalog.map(item=>({
    key:item.key,label:item.label,visible:item.defaultVisible,position:item.defaultPosition,targetValue:null,
  }));
}

export async function getRecruitingMetricPreferences(actor:Actor):Promise<RecruitingMetricPreference[]>{
  requireCapability(actor,"recruiting.candidate.read");
  if(actor.demo)return defaultRecruitingMetricPreferences();
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<{metricKey:string;displayLabel:string|null;position:number;visible:boolean;targetValue:number|null}>>`
      SELECT metric_key "metricKey",display_label "displayLabel",position,visible,target_value::float8 "targetValue"
      FROM analytics_metric_preferences
      WHERE module_code='recruiting_needs' AND scope_type='organization' AND scope_id=${actor.organizationId}::uuid
      ORDER BY position,metric_key
    `;
    const override=new Map(rows.map(row=>[row.metricKey,row]));
    return defaultRecruitingMetricPreferences().map(item=>{
      const row=override.get(item.key);
      return row?{key:item.key,label:row.displayLabel?.trim()||item.label,visible:row.visible,position:row.position,targetValue:row.targetValue}:item;
    }).sort((a,b)=>a.position-b.position);
  });
}

export async function saveRecruitingMetricPreferences(actor:Actor,items:RecruitingMetricPreference[]){
  requireCapability(actor,"recruiting.analytics.configure");
  if(actor.demo)return {saved:false,demo:true};
  const clean=items
    .filter(item=>isRecruitingMetricKey(item.key))
    .map((item,index)=>{
      const definition=recruitingMetricDefinition(item.key);
      return {
        key:item.key,
        label:(item.label||definition.label).trim().slice(0,120),
        visible:Boolean(item.visible),
        position:Number.isFinite(item.position)?Math.max(0,Math.trunc(item.position)):index*10,
        targetValue:item.targetValue==null||!Number.isFinite(item.targetValue)?null:Number(item.targetValue),
      };
    });
  return withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
    await tx`
      DELETE FROM analytics_metric_preferences
      WHERE module_code='recruiting_needs' AND scope_type='organization' AND scope_id=${actor.organizationId}::uuid
    `;
    for(const item of clean){
      await tx`
        INSERT INTO analytics_metric_preferences(
          organization_id,module_code,scope_type,scope_id,metric_key,display_label,position,visible,target_value,updated_by_user_id,updated_at
        ) VALUES (
          ${actor.organizationId}::uuid,'recruiting_needs','organization',${actor.organizationId}::uuid,
          ${item.key},${item.label},${item.position},${item.visible},${item.targetValue},${actor.userId}::uuid,now()
        )
      `;
    }
    await tx`
      INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
      VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'analytics_view',${actor.organizationId}::uuid,'updated',
        'Обновлена витрина метрик аналитики подбора',${sql.json({module:"recruiting_needs",metrics:clean.map(item=>item.key)})})
    `;
    return {saved:true};
  }));
}
