import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const nullableText=(max:number)=>z.string().trim().max(max).nullable().optional();
const coreSchema=z.object({action:z.literal("core"),title:z.string().trim().min(3).max(300),customerName:nullableText(300),clientId:z.string().uuid().nullable().optional(),platform:nullableText(160),procedureNumber:nullableText(180),sourceUrl:z.string().url().max(2000).nullable().optional(),sourceName:nullableText(180),publicationDate:z.string().date().nullable().optional(),submissionDeadline:z.string().datetime({offset:true}).nullable().optional(),initialPrice:z.number().nonnegative().nullable().optional(),billingUnit:z.enum(["unknown","hour","shift","worker_month","unit","piecework","project","mixed"]),priority:z.enum(["low","normal","high"]),potential:z.enum(["low","medium","high"]),regionId:z.string().uuid().nullable().optional(),legalEntityId:z.string().uuid().nullable().optional(),nextActionText:nullableText(1000),nextActionAt:z.string().datetime({offset:true}).nullable().optional()});
const analysisSchema=z.object({action:z.literal("analysis"),analysisSummary:nullableText(12000),conditions:z.record(z.string(),z.json())});
const stageSchema=z.object({action:z.literal("stage"),stage:z.enum(["new","analysis","clarification","calculation","approval","preparation","submitted","awaiting_result","completed"]),decision:z.enum(["undecided","participate","needs_clarification","no_bid"]).optional(),result:z.enum(["won","lost","no_bid","cancelled","failed"]).nullable().optional(),closeReason:nullableText(4000)});
const submissionSchema=z.object({action:z.literal("submission"),finalBidValue:z.number().nonnegative().nullable().optional(),bidReference:nullableText(500),submissionNote:nullableText(5000),checklist:z.array(z.object({id:z.string().max(100),label:z.string().trim().min(1).max(300),done:z.boolean()})).max(40),markSubmitted:z.boolean().optional()});
const schema=z.discriminatedUnion("action",[coreSchema,analysisSchema,stageSchema,submissionSchema]);
type ScopeRow={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;stage:string;result:string|null};

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.edit");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<ScopeRow>>`SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",stage,result FROM tenders WHERE id=${id}::uuid FOR UPDATE`;
      if(!scope)throw new Error("Тендер не найден");if(!canReadRow(actor.access,"sales.tender.edit",scope,actor))throw new AccessDeniedError("sales.tender.edit");
      let summary="Тендер обновлён";
      if(body.action==="core"){
        await tx`UPDATE tenders SET title=${body.title},customer_name=${body.customerName??null},client_company_id=${body.clientId??null}::uuid,platform=${body.platform??null},procedure_number=${body.procedureNumber??null},source_url=${body.sourceUrl??null},source_name=${body.sourceName??null},publication_date=${body.publicationDate??null}::date,submission_deadline=${body.submissionDeadline??null}::timestamptz,initial_price=${body.initialPrice??null},billing_unit=${body.billingUnit},priority=${body.priority},potential=${body.potential},region_id=${body.regionId??null}::uuid,legal_entity_id=${body.legalEntityId??null}::uuid,next_action_text=${body.nextActionText??null},next_action_at=${body.nextActionAt??null}::timestamptz,updated_at=now() WHERE id=${id}::uuid`;summary="Обновлены основные данные тендера";
      }else if(body.action==="analysis"){
        await tx`UPDATE tenders SET analysis_summary=${body.analysisSummary??null},conditions_json=${sql.json(body.conditions)},updated_at=now() WHERE id=${id}::uuid`;summary="Обновлено аналитическое заключение";
      }else if(body.action==="stage"){
        if(body.stage==="submitted")requireCapability(actor,"sales.tender.submit");
        if(body.stage==="completed")requireCapability(actor,"sales.tender.result");
        const decision=body.decision??(body.result==="no_bid"?"no_bid":undefined);
        const resultValue=body.result===undefined?scope.result:body.result;
        if(body.stage==="completed"&&!resultValue)throw new Error("Для завершения тендера укажите результат");
        await tx`UPDATE tenders SET stage=${body.stage},decision=COALESCE(${decision??null},decision),result=${resultValue??null},close_reason=${body.closeReason??null},updated_at=now() WHERE id=${id}::uuid`;
        summary=`Этап тендера изменён на ${body.stage}`;
      }else{
        if(body.markSubmitted)requireCapability(actor,"sales.tender.submit");
        await tx`UPDATE tenders SET final_bid_value=${body.finalBidValue??null},bid_reference=${body.bidReference??null},submission_note=${body.submissionNote??null},submission_checklist=${sql.json(body.checklist)},submitted_at=CASE WHEN ${body.markSubmitted??false} THEN COALESCE(submitted_at,now()) ELSE submitted_at END,submitted_by_user_id=CASE WHEN ${body.markSubmitted??false} THEN ${actor.userId}::uuid ELSE submitted_by_user_id END,stage=CASE WHEN ${body.markSubmitted??false} THEN 'submitted' ELSE stage END,updated_at=now() WHERE id=${id}::uuid`;summary=body.markSubmitted?"Тендер отмечен как поданный":"Обновлена подготовка к подаче";
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${id}::uuid,'updated',${summary})`;
      return {id,action:body.action};
    }));return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные тендера",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
