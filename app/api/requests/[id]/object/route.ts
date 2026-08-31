import {NextResponse} from "next/server";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"operations.object.create");requireCapability(actor,"sales.request.read");
  if(actor.demo)return NextResponse.json({error:"Демонстрационный набор данных доступен только для чтения."},{status:409});
  const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
   const [existing]=await tx<Array<{id:string}>>`SELECT id FROM objects WHERE source_request_id=${id}::uuid LIMIT 1`;if(existing)return {id:existing.id,created:false};
   const [request]=await tx<Array<{id:string;organizationId:string;number:string;title:string;stage:string;clientId:string|null;regionId:string|null;ownerUserId:string|null;createdByUserId:string;teamId:string|null;siteName:string|null;address:string|null;startDate:string|null;acceptedProposalId:string|null}>>`
    SELECT id,organization_id "organizationId",request_number number,title,commercial_stage stage,client_company_id "clientId",region_id "regionId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",site_name "siteName",address_text address,expected_start_date::text "startDate",accepted_proposal_id "acceptedProposalId" FROM requests WHERE id=${id}::uuid`;
   if(!request)return null;if(!canReadRow(actor.access,"sales.request.read",request,actor))throw new AccessDeniedError("sales.request.read");
   if(request.stage!=="accepted")throw new Error("REQUEST_NOT_ACCEPTED");if(!request.clientId)throw new Error("CLIENT_REQUIRED");if(!request.regionId)throw new Error("REGION_REQUIRED");
   const [proposal]=await tx<Array<{id:string;scenarioIds:string[]}>>`SELECT id,scenario_ids "scenarioIds" FROM proposals WHERE request_id=${id}::uuid AND (id=${request.acceptedProposalId??null}::uuid OR status='accepted') ORDER BY (id=${request.acceptedProposalId??null}::uuid) DESC,version DESC LIMIT 1`;
   if(!proposal)throw new Error("PROPOSAL_REQUIRED");
   const roles=await tx<Array<{id:string;specialtyId:string|null;count:number}>>`SELECT id,specialty_id "specialtyId",count_required count FROM request_roles WHERE request_id=${id}::uuid ORDER BY created_at`;if(roles.some(role=>!role.specialtyId))throw new Error("SPECIALTY_REQUIRED");
   const suffix=request.number.replace(/^З-/,"");const code=`OBJ-${suffix}`;
   const [object]=await tx<Array<{id:string}>>`INSERT INTO objects(organization_id,client_company_id,source_request_id,name,code,status,region_id,address_text,target_start_date,owner_user_id,created_by_user_id) VALUES(${actor.organizationId}::uuid,${request.clientId}::uuid,${id}::uuid,${request.siteName||request.title},${code},'launch',${request.regionId}::uuid,${request.address},${request.startDate}::date,${request.ownerUserId??actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;
   for(const role of roles)await tx`INSERT INTO needs(organization_id,object_id,source_request_role_id,specialty_id,count_required,status,owner_user_id,created_by_user_id) VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${role.id}::uuid,${role.specialtyId}::uuid,${role.count},'open',${request.ownerUserId??actor.userId}::uuid,${actor.userId}::uuid)`;
   const rates=await tx<Array<{scenarioId:string;specialtyId:string;amount:number}>>`SELECT cs.id "scenarioId",rr.specialty_id "specialtyId",COALESCE((cs.result_snapshot->>'clientRateExVat')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric) amount FROM calculation_scenarios cs JOIN request_roles rr ON rr.id=cs.request_role_id WHERE cs.id=ANY(${proposal.scenarioIds}::uuid[]) AND rr.specialty_id IS NOT NULL`;
   for(const rate of rates)if(rate.amount!=null)await tx`INSERT INTO client_rates(organization_id,client_company_id,object_id,specialty_id,accepted_scenario_id,amount,unit,effective_from,created_by_user_id) VALUES(${actor.organizationId}::uuid,${request.clientId}::uuid,${object.id}::uuid,${rate.specialtyId}::uuid,${rate.scenarioId}::uuid,${rate.amount},'hour',COALESCE(${request.startDate}::date,current_date),${actor.userId}::uuid)`;
   await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${id}::uuid,'object.created','Из принятой заявки создан объект',${sql.json({objectId:object.id,proposalId:proposal.id})})`;
   await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${object.id}::uuid,'object.created_from_request','Объект создан из принятой заявки',${sql.json({requestId:id,proposalId:proposal.id})})`;
   return {id:object.id,created:true};
  }));
  if(!result)return NextResponse.json({error:"Заявка не найдена"},{status:404});return NextResponse.json(result,{status:result.created?201:200});
 }catch(error){
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Forbidden"},{status:403});
  if(error instanceof Error){const messages:Record<string,string>={REQUEST_NOT_ACCEPTED:"Объект можно создать только после принятия предложения",CLIENT_REQUIRED:"Перед созданием объекта привяжите клиента",REGION_REQUIRED:"Перед созданием объекта укажите регион",PROPOSAL_REQUIRED:"Не найдено принятое КП",SPECIALTY_REQUIRED:"Перед созданием объекта сопоставьте все позиции со справочником специальностей"};if(messages[error.message])return NextResponse.json({error:messages[error.message]},{status:409});}
  console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});
 }
}
