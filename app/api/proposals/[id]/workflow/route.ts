import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";
const schema=z.object({action:z.enum(["send","accept","reject","negotiation"]),comment:z.string().trim().max(3000).optional()});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"sales.proposal.send");if(actor.demo)return NextResponse.json({error:"Демонстрационный набор данных доступен только для чтения."},{status:409});const body=schema.parse(await request.json());
  const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
   const [proposal]=await tx<Array<{id:string;requestId:string;version:number;status:string;sentAt:string|null;scenarioIds:string[]}>>`SELECT id,request_id "requestId",version,status,sent_at::text "sentAt",scenario_ids "scenarioIds" FROM proposals WHERE id=${id}::uuid`;if(!proposal)return null;
   if(body.action==="send"){
    if(proposal.status!=="draft")throw new Error("SEND_STATE");await tx`UPDATE proposals SET status='sent',sent_at=now(),sent_by_user_id=${actor.userId}::uuid WHERE id=${id}::uuid`;await tx`UPDATE requests SET commercial_stage='proposal_sent',updated_at=now() WHERE id=${proposal.requestId}::uuid`;
   }else if(body.action==="accept"){
    if(!proposal.sentAt&&proposal.status!=="sent")throw new Error("CLIENT_DECISION_STATE");await tx`UPDATE proposals SET status='accepted',accepted_at=now(),accepted_by_user_id=${actor.userId}::uuid WHERE id=${id}::uuid`;const [rate]=await tx<Array<{amount:number|null}>>`SELECT max(COALESCE((result_snapshot->>'clientRateExVat')::numeric,(result_snapshot->>'clientRateHourly')::numeric)) amount FROM calculation_scenarios WHERE id=ANY(${proposal.scenarioIds}::uuid[])`;await tx`UPDATE requests SET commercial_stage='accepted',business_result='won',accepted_proposal_id=${id}::uuid,agreed_client_rate=${rate?.amount??null},updated_at=now() WHERE id=${proposal.requestId}::uuid`;
   }else if(body.action==="reject"){
    if(!proposal.sentAt&&proposal.status!=="sent")throw new Error("CLIENT_DECISION_STATE");await tx`UPDATE proposals SET status='rejected',client_note=COALESCE(${body.comment||null},client_note) WHERE id=${id}::uuid`;await tx`UPDATE requests SET commercial_stage='negotiation',updated_at=now() WHERE id=${proposal.requestId}::uuid`;
   }else{
    await tx`UPDATE requests SET commercial_stage='negotiation',updated_at=now() WHERE id=${proposal.requestId}::uuid`;
   }
   const verb=body.action==="send"?'proposal.sent':body.action==="accept"?'proposal.accepted':body.action==="reject"?'proposal.rejected':'request.negotiation';const summary=body.action==="send"?`КП v${proposal.version} отправлено клиенту`:body.action==="accept"?`Клиент принял КП v${proposal.version}`:body.action==="reject"?`Клиент отклонил КП v${proposal.version}`:'Заявка переведена в переговоры';
   await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${proposal.requestId}::uuid,${verb},${summary},${sql.json({requestId:proposal.requestId,proposalId:id,version:proposal.version,comment:body.comment||null})})`;
   return {id,status:body.action==="send"?"sent":body.action==="accept"?"accepted":body.action==="reject"?"rejected":proposal.status};
  }));if(!result)return NextResponse.json({error:"КП не найдено"},{status:404});return NextResponse.json(result);
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Forbidden"},{status:403});if(error instanceof Error){const messages:Record<string,string>={SEND_STATE:"Отправить можно только черновую версию КП",CLIENT_DECISION_STATE:"Решение клиента можно зафиксировать только после отправки КП"};if(messages[error.message])return NextResponse.json({error:messages[error.message]},{status:409});}console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});}
}
