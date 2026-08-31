import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";
const schema=z.object({action:z.enum(["submit","approve","reject","rework"]),assignedToUserId:z.string().uuid().nullable().optional(),comment:z.string().trim().max(3000).optional()});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});if(actor.demo)return NextResponse.json({error:"Демонстрационный набор данных доступен только для чтения."},{status:409});const body=schema.parse(await request.json());
  if(body.action==="submit")requireCapability(actor,"calculation.scenario.create");else requireCapability(actor,"calculation.scenario.approve");
  const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
   const [scenario]=await tx<Array<{id:string;status:string;name:string;requestId:string|null}>>`SELECT cs.id,cs.status,cs.name,c.request_id "requestId" FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE cs.id=${id}::uuid`;if(!scenario)return null;
   if(body.action==="submit"){
    if(scenario.status!=="draft")throw new Error("SUBMIT_STATE");const [round]=await tx<Array<{n:number}>>`SELECT COALESCE(max(round),0)::int+1 n FROM calculation_approvals WHERE calculation_scenario_id=${id}::uuid`;
    const [approval]=await tx<Array<{id:string;status:string;round:number}>>`INSERT INTO calculation_approvals(organization_id,calculation_scenario_id,round,status,requested_by_user_id,assigned_to_user_id,comment) VALUES(${actor.organizationId}::uuid,${id}::uuid,${round.n},'pending',${actor.userId}::uuid,${body.assignedToUserId??null}::uuid,${body.comment||null}) RETURNING id,status,round`;
    await tx`UPDATE calculation_scenarios SET status='review' WHERE id=${id}::uuid`;if(scenario.requestId)await tx`UPDATE requests SET commercial_stage='approval',updated_at=now() WHERE id=${scenario.requestId}::uuid`;
    if(scenario.requestId)await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${scenario.requestId}::uuid,'calculation.approval_requested',${`Сценарий «${scenario.name}» отправлен на согласование`},${sql.json({requestId:scenario.requestId,scenarioId:id,approvalId:approval.id,round:approval.round})})`;
    return approval;
   }
   const [approval]=await tx<Array<{id:string;round:number}>>`SELECT id,round FROM calculation_approvals WHERE calculation_scenario_id=${id}::uuid AND status='pending' ORDER BY round DESC LIMIT 1`;if(!approval)throw new Error("NO_PENDING_APPROVAL");
   const status=body.action==="approve"?"approved":body.action==="reject"?"rejected":"rework";await tx`UPDATE calculation_approvals SET status=${status},decided_by_user_id=${actor.userId}::uuid,decided_at=now(),comment=COALESCE(${body.comment||null},comment) WHERE id=${approval.id}::uuid`;
   const scenarioStatus=body.action==="approve"?"accepted":body.action==="reject"?"rejected":"draft";await tx`UPDATE calculation_scenarios SET status=${scenarioStatus},approval_comment=${body.comment||null} WHERE id=${id}::uuid`;
   if(scenario.requestId){if(body.action==="approve")await tx`UPDATE requests SET selected_scenario_id=${id}::uuid,commercial_stage='proposal_prepared',updated_at=now() WHERE id=${scenario.requestId}::uuid`;else await tx`UPDATE requests SET commercial_stage='calculation',updated_at=now() WHERE id=${scenario.requestId}::uuid`;
    const verb=body.action==="approve"?'calculation.approved':body.action==="reject"?'calculation.rejected':'calculation.rework';const summary=body.action==="approve"?`Сценарий «${scenario.name}» согласован`:body.action==="reject"?`Сценарий «${scenario.name}» отклонён`:`Сценарий «${scenario.name}» возвращён на доработку`;
    await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${scenario.requestId}::uuid,${verb},${summary},${sql.json({requestId:scenario.requestId,scenarioId:id,approvalId:approval.id,round:approval.round})})`;}
   return {id:approval.id,status,round:approval.round};
  }));if(!result)return NextResponse.json({error:"Сценарий не найден"},{status:404});return NextResponse.json(result);
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие согласования"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Forbidden"},{status:403});if(error instanceof Error){const messages:Record<string,string>={SUBMIT_STATE:"На согласование можно отправить только черновой сценарий",NO_PENDING_APPROVAL:"Нет ожидающего решения по этому сценарию"};if(messages[error.message])return NextResponse.json({error:messages[error.message]},{status:409});}console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});}
}
