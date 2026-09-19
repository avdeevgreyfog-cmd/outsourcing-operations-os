import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import {
  defaultRecruitingMetricPreferences,
  isRecruitingMetricKey,
  recruitingMetricDefinition,
  type RecruitingMetricPreference,
} from "./analytics-metric-registry";

export type { RecruitingMetricPreference } from "./analytics-metric-registry";

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
