import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
const jsonObject=z.record(z.string(),z.json());
const schema=z.object({calculationId:z.string().uuid().nullable().optional(),scenarioId:z.string().uuid().nullable().optional(),requestId:z.string().uuid().nullable().optional(),requestRoleId:z.string().uuid().nullable().optional(),sourceKind:z.enum(["request","standalone"]),title:z.string().trim().min(2).max(200),modelCode:z.enum(["employment","gph","npd","custom"]),ruleVersionId:z.string().uuid().nullable().optional(),name:z.string().trim().min(2).max(160),saveMode:z.enum(["update","new","duplicate"]).default("update"),inputs:jsonObject,costs:z.array(jsonObject),result:jsonObject}).refine(value=>value.sourceKind!=="request"||Boolean(value.requestId),{message:"Для расчёта из заявки требуется requestId"});

export async function POST(request:Request){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"calculation.scenario.create");if(actor.demo)return NextResponse.json({error:"Демонстрационный набор данных доступен только для чтения."},{status:409});const body=schema.parse(await request.json());
  const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
   let requestRow:{id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null}|null=null;
   if(body.requestId){if(!hasCapability(actor.access,"sales.request.read"))throw new AccessDeniedError("sales.request.read");const [found]=await tx<Array<typeof requestRow>>`SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId" FROM requests WHERE id=${body.requestId}::uuid`;requestRow=found;if(!requestRow||!canReadRow(actor.access,"sales.request.read",requestRow,actor))throw new AccessDeniedError("sales.request.read");}
   if(body.requestRoleId&&body.requestId){const [role]=await tx<Array<{id:string}>>`SELECT id FROM request_roles WHERE id=${body.requestRoleId}::uuid AND request_id=${body.requestId}::uuid`;if(!role)throw new Error("ROLE_MISMATCH");}
   const [model]=await tx<Array<{id:string}>>`SELECT id FROM calculation_models WHERE model_type=${body.modelCode} AND active=true ORDER BY created_at LIMIT 1`;if(!model)throw new Error("MODEL_NOT_FOUND");
   if(body.ruleVersionId){const [rule]=await tx<Array<{id:string}>>`SELECT id FROM calculation_rule_versions WHERE id=${body.ruleVersionId}::uuid AND calculation_model_id=${model.id}::uuid`;if(!rule)throw new Error("RULE_MISMATCH");}
   let calculationId=body.calculationId??null;
   if(calculationId){const [existing]=await tx<Array<{id:string;requestId:string|null;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;organizationId:string}>>`SELECT c.id,c.request_id "requestId",c.owner_user_id "ownerUserId",c.created_by_user_id "createdByUserId",c.assigned_team_id "teamId",c.region_id "regionId",c.organization_id "organizationId" FROM calculations c WHERE c.id=${calculationId}::uuid`;if(!existing||!canReadRow(actor.access,"calculation.scenario.create",existing,actor))throw new AccessDeniedError("calculation.scenario.create");if((existing.requestId??null)!==(body.requestId??null))throw new Error("CALCULATION_CONTEXT_MISMATCH");}
   else{const [created]=await tx<Array<{id:string}>>`INSERT INTO calculations(organization_id,request_id,title,source_kind,client_company_id,region_id,assigned_team_id,status,owner_user_id,created_by_user_id) VALUES(${actor.organizationId}::uuid,${body.requestId??null}::uuid,${body.title},${body.sourceKind},${requestRow?.clientId??null}::uuid,${requestRow?.regionId??null}::uuid,${requestRow?.teamId??actor.teamIds[0]??null}::uuid,'draft',${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;calculationId=created.id;}
   if(body.scenarioId&&body.saveMode==="update"){
    const [existingScenario]=await tx<Array<{id:string;status:string;scenarioNumber:number;calculationId:string}>>`SELECT id,status,scenario_number "scenarioNumber",calculation_id "calculationId" FROM calculation_scenarios WHERE id=${body.scenarioId}::uuid`;
    if(!existingScenario||existingScenario.calculationId!==calculationId)throw new Error("SCENARIO_NOT_FOUND");if(existingScenario.status!=="draft")throw new Error("NEW_VERSION_REQUIRED");
    const [updated]=await tx<Array<{id:string;scenarioNumber:number;status:string}>>`UPDATE calculation_scenarios SET request_role_id=${body.requestRoleId??null}::uuid,model_id=${model.id}::uuid,rule_version_id=${body.ruleVersionId??null}::uuid,name=${body.name},inputs_snapshot=${sql.json(body.inputs)},cost_snapshot=${sql.json(body.costs)},result_snapshot=${sql.json(body.result)} WHERE id=${body.scenarioId}::uuid RETURNING id,scenario_number "scenarioNumber",status`;
    return {...updated,calculationId};
   }
   const [next]=await tx<Array<{n:number}>>`SELECT COALESCE(max(scenario_number),0)::int+1 n FROM calculation_scenarios WHERE calculation_id=${calculationId}::uuid`;
   const [createdScenario]=await tx<Array<{id:string;scenarioNumber:number;status:string}>>`INSERT INTO calculation_scenarios(organization_id,calculation_id,request_role_id,model_id,rule_version_id,name,status,scenario_number,parent_scenario_id,inputs_snapshot,cost_snapshot,result_snapshot,created_by_user_id) VALUES(${actor.organizationId}::uuid,${calculationId}::uuid,${body.requestRoleId??null}::uuid,${model.id}::uuid,${body.ruleVersionId??null}::uuid,${body.name},'draft',${next.n},${body.scenarioId??null}::uuid,${sql.json(body.inputs)},${sql.json(body.costs)},${sql.json(body.result)},${actor.userId}::uuid) RETURNING id,scenario_number "scenarioNumber",status`;
   if(body.requestId)await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${body.requestId}::uuid,'calculation.scenario_created',${`Создан сценарий расчёта v${createdScenario.scenarioNumber}: ${body.name}`},${sql.json({requestId:body.requestId,calculationId,scenarioId:createdScenario.id,scenarioNumber:createdScenario.scenarioNumber})})`;
   return {...createdScenario,calculationId};
  }));return NextResponse.json(row,{status:body.scenarioId&&body.saveMode==="update"?200:201});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры сценария",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Forbidden"},{status:403});
  if(error instanceof Error){const messages:Record<string,string>={ROLE_MISMATCH:"Позиция не относится к выбранной заявке",MODEL_NOT_FOUND:"Активная модель расчёта не найдена",RULE_MISMATCH:"Версия правил не относится к выбранной модели",CALCULATION_CONTEXT_MISMATCH:"Нельзя изменить связь существующего расчёта с заявкой",SCENARIO_NOT_FOUND:"Сценарий не найден",NEW_VERSION_REQUIRED:"Сценарий уже отправлен в workflow. Сохраните изменения как новую версию."};if(messages[error.message])return NextResponse.json({error:messages[error.message]},{status:409});}
  console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});
 }
}
