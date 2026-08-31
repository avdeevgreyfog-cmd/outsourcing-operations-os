import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
const jsonObject=z.record(z.string(),z.json());
const schema=z.object({calculationId:z.string().uuid().optional(),requestId:z.string().uuid().optional(),requestRoleId:z.string().uuid().optional(),modelId:z.string().uuid(),ruleVersionId:z.string().uuid().optional(),name:z.string().trim().min(2).max(160),title:z.string().trim().max(200).optional(),calculationMode:z.enum(["target_margin","client_limit"]).default("target_margin"),clientLimit:z.number().nonnegative().optional(),clientLimitVatMode:z.enum(["with_vat","without_vat"]).optional(),inputs:jsonObject,costs:z.array(jsonObject),result:jsonObject,sourceSnapshot:jsonObject.default({})});

export async function GET(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"calculation.scenario.read");
    const requestId=new URL(request.url).searchParams.get("request");
    if(actor.demo)return NextResponse.json({demo:true,models:[{id:"demo-employment",code:"employment",name:"Трудовой договор",ruleVersionId:null,rules:{legalParametersVerified:false}},{id:"demo-gph",code:"gph",name:"ГПХ",ruleVersionId:null,rules:{legalParametersVerified:false}},{id:"demo-npd",code:"npd",name:"НПД",ruleVersionId:null,rules:{legalParametersVerified:false}},{id:"demo-custom",code:"custom",name:"Модель компании",ruleVersionId:null,rules:{legalParametersVerified:false}}],request:null});
    const data=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const models=await sql<Array<{id:string;code:string;name:string;ruleVersionId:string|null;rules:Record<string,unknown>|null}>>`
        SELECT m.id,m.code,m.name,rv.id "ruleVersionId",rv.rules_json rules FROM calculation_models m
        LEFT JOIN LATERAL (SELECT id,rules_json FROM calculation_rule_versions v WHERE v.calculation_model_id=m.id AND v.effective_from<=current_date AND (v.effective_to IS NULL OR v.effective_to>=current_date) ORDER BY v.version DESC LIMIT 1) rv ON true
        WHERE m.active=true ORDER BY m.name`;
      let source=null;
      if(requestId){const [row]=await sql<Array<{id:string;title:string;regionId:string|null;schedule:Record<string,unknown>;provision:Record<string,unknown>;limits:Record<string,unknown>;roles:unknown[]}>>`
        SELECT r.id,r.title,r.region_id "regionId",r.schedule_json schedule,r.provision_json provision,r.commercial_limits_json limits,
        COALESCE(jsonb_agg(jsonb_build_object('id',rr.id,'name',s.name,'count',rr.count_required,'salaryTarget',rr.salary_target,'paidHours',rr.paid_hours,'presenceHours',rr.presence_hours,'scheduleType',rr.schedule_type,'requirements',rr.requirements_json)) FILTER(WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
        FROM requests r LEFT JOIN request_roles rr ON rr.request_id=r.id LEFT JOIN specialties s ON s.id=rr.specialty_id WHERE r.id=${requestId}::uuid GROUP BY r.id`;
        source=row??null;
      }
      return {demo:false,models,request:source};
    });
    return NextResponse.json(data);
  }catch(error){if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});}
}

export async function POST(request:Request){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"calculation.scenario.create");if(actor.demo)return NextResponse.json({error:"Демо-данные доступны только для чтения"},{status:409});const b=schema.parse(await request.json());const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{let calculationId=b.calculationId;if(!calculationId){const number=`Р-${new Date().toISOString().slice(2,7).replace('-','')}-${crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`;const [calc]=await tx<Array<{id:string}>>`INSERT INTO calculations(organization_id,request_id,calculation_number,title,origin,status,source_snapshot,owner_user_id,created_by_user_id) VALUES (${actor.organizationId}::uuid,${b.requestId??null}::uuid,${number},${b.title??b.name},${b.requestId?'request':'standalone'},'draft',${sql.json(b.sourceSnapshot)},${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;calculationId=calc.id;}const [{nextVersion}]=await tx<Array<{nextVersion:number}>>`SELECT COALESCE(max(scenario_number),0)::int+1 "nextVersion" FROM calculation_scenarios WHERE calculation_id=${calculationId}::uuid`;const [created]=await tx<Array<{id:string;name:string;status:string;createdAt:string}>>`INSERT INTO calculation_scenarios (organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,scenario_number,calculation_mode,client_limit,client_limit_vat_mode,inputs_snapshot,cost_snapshot,result_snapshot,created_by_user_id) VALUES (${actor.organizationId}::uuid,${calculationId}::uuid,${b.requestRoleId??null}::uuid,${b.modelId}::uuid,${b.ruleVersionId??null}::uuid,${b.name},'draft',${nextVersion},${b.calculationMode},${b.clientLimit??null},${b.clientLimitVatMode??null},${sql.json(b.inputs)},${sql.json(b.costs)},${sql.json(b.result)},${actor.userId}::uuid) RETURNING id,name,status,created_at "createdAt"`;if(b.requestId)await tx`UPDATE requests SET stage='calculation',status='calculation',updated_at=now() WHERE id=${b.requestId}::uuid`;return created}));return NextResponse.json(row,{status:201})}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Ошибка проверки данных",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500})}}
