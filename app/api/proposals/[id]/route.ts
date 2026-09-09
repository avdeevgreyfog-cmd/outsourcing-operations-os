import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { normalizeTemplateConfig } from "@/lib/commercial/proposal-template";

const editSchema=z.object({
  action:z.literal("edit"),
  templateId:z.string().uuid().nullable().optional(),
  objectName:z.string().trim().min(2).max(240),
  description:z.string().trim().max(4000).nullable().optional(),
  schedule:z.string().trim().max(1000).nullable().optional(),
  included:z.array(z.string().trim().min(1).max(300)).max(30),
  clientProvides:z.array(z.string().trim().min(1).max(300)).max(30),
  terms:z.string().trim().max(4000).nullable().optional(),
  additionalConditions:z.string().trim().max(4000).nullable().optional(),
  comment:z.string().trim().max(2000).nullable().optional(),
  documentTitle:z.string().trim().min(2).max(240),
  intro:z.string().trim().max(2500),
  priceDisplay:z.enum(["both","gross_only","net_only"]),
  showIncluded:z.boolean(),showClientProvides:z.boolean(),showTerms:z.boolean(),showManager:z.boolean(),showCta:z.boolean(),
  cta:z.string().trim().max(1000),
  managerName:z.string().trim().min(2).max(180),
  managerPhone:z.string().trim().max(80).nullable().optional(),
  managerEmail:z.string().trim().email().max(240).nullable().optional(),
  managerTelegram:z.string().trim().max(160).nullable().optional(),
});
const lifecycleSchema=z.object({action:z.enum(["send","negotiate","accept","revise","reject"]),note:z.string().trim().max(2000).optional()});
const schema=z.discriminatedUnion("action",[editSchema,lifecycleSchema]);

type ProposalRow={
  id:string;requestId:string;status:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;
  content:Record<string,unknown>;
};
type TemplateSnapshot={id:string;name:string;kind:"operis"|"docx";version:number};
type TemplateRow=TemplateSnapshot&{config:unknown};

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const capability=body.action==="edit"?"sales.proposal.edit":"sales.proposal.client_decision";
    requireCapability(actor,capability);
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<ProposalRow>>`
        SELECT p.id,p.request_id "requestId",p.status,p.content_snapshot content,r.organization_id "organizationId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",
          r.assigned_team_id "teamId",r.region_id "regionId",r.client_company_id "clientId"
        FROM proposals p JOIN requests r ON r.id=p.request_id WHERE p.id=${id}::uuid FOR UPDATE
      `;
      if(!row)throw new Error("КП не найдено");
      if(!canReadRow(actor.access,capability,row,actor))throw new AccessDeniedError(capability);

      if(body.action==="edit"){
        if(row.status!=="draft")throw new Error("Редактировать клиентские условия можно только в черновике КП. После отправки на согласование создайте новую версию");
        let template=(row.content.template??null) as TemplateSnapshot|null;
        let basePresentation=normalizeTemplateConfig(row.content.presentation);
        if(body.templateId){
          const [selected]=await tx<Array<TemplateRow>>`
            SELECT id,name,kind,version,config_json config FROM proposal_templates WHERE id=${body.templateId}::uuid AND status='active'
          `;
          if(!selected)throw new Error("Выбранный шаблон КП не найден");
          template={id:selected.id,name:selected.name,kind:selected.kind,version:selected.version};
          basePresentation=normalizeTemplateConfig(selected.config);
        }
        const presentation=normalizeTemplateConfig({
          ...basePresentation,documentTitle:body.documentTitle,intro:body.intro,priceDisplay:body.priceDisplay,
          showIncluded:body.showIncluded,showClientProvides:body.showClientProvides,showTerms:body.showTerms,
          showManager:body.showManager,showCta:body.showCta,cta:body.cta,
        });
        const content={
          ...row.content,objectName:body.objectName,description:body.description??null,schedule:body.schedule??null,
          included:body.included,clientProvides:body.clientProvides,terms:body.terms??null,
          additionalConditions:body.additionalConditions??null,comment:body.comment??null,template,presentation,
          manager:{name:body.managerName,phone:body.managerPhone??null,email:body.managerEmail??null,telegram:body.managerTelegram??null},
        };
        await tx`UPDATE proposals SET content_snapshot=${sql.json(JSON.parse(JSON.stringify(content)))} WHERE id=${id}::uuid`;
        return {id,action:body.action,requestId:row.requestId,status:row.status};
      }

      if(body.action==="send"){
        if(row.status!=="approved")throw new Error("Отправить клиенту можно только внутренне согласованное КП");
        await tx`UPDATE proposals SET status='sent',sent_at=now() WHERE id=${id}::uuid`;
        await tx`UPDATE requests SET status='proposal_sent',updated_at=now() WHERE id=${row.requestId}::uuid`;
      }else if(body.action==="negotiate"){
        if(!["approved","sent","negotiation"].includes(row.status))throw new Error("Переговоры доступны после согласования КП");
        await tx`UPDATE proposals SET status='negotiation',client_decision_note=${body.note??null} WHERE id=${id}::uuid`;
        await tx`UPDATE requests SET status='negotiation',updated_at=now() WHERE id=${row.requestId}::uuid`;
      }else if(body.action==="accept"){
        if(!["sent","negotiation"].includes(row.status))throw new Error("Принятие фиксируется только для отправленного КП или переговоров");
        const [alreadyAccepted]=await tx<Array<{id:string}>>`SELECT id FROM proposals WHERE request_id=${row.requestId}::uuid AND status='accepted' AND id<>${id}::uuid LIMIT 1`;
        if(alreadyAccepted)throw new Error("По заявке уже зафиксирована другая принятая версия КП");
        await tx`UPDATE proposals SET status='accepted',accepted_at=now(),client_decision_note=${body.note??null} WHERE id=${id}::uuid`;
        await tx`UPDATE requests SET status='accepted',won_at=now(),lost_at=NULL,updated_at=now() WHERE id=${row.requestId}::uuid`;
      }else if(body.action==="revise"){
        if(!["sent","negotiation"].includes(row.status))throw new Error("Возврат на пересчёт доступен после отправки КП");
        await tx`UPDATE proposals SET status='revision_requested',client_decision_note=${body.note??null} WHERE id=${id}::uuid`;
        await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${row.requestId}::uuid`;
      }else{
        if(!["sent","negotiation"].includes(row.status))throw new Error("Отказ клиента фиксируется после отправки КП");
        await tx`UPDATE proposals SET status='client_rejected',rejected_at=now(),client_decision_note=${body.note??null} WHERE id=${id}::uuid`;
        await tx`UPDATE requests SET status='lost',lost_at=now(),updated_at=now() WHERE id=${row.requestId}::uuid`;
      }
      return {id,action:body.action,requestId:row.requestId};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректные данные КП",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
