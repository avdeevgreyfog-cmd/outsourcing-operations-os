import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({action:z.enum(["send","negotiate","accept","revise","reject"]),note:z.string().trim().max(2000).optional()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.proposal.client_decision");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<{id:string;requestId:string;status:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null}>>`
        SELECT p.id,p.request_id "requestId",p.status,r.organization_id "organizationId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",
          r.assigned_team_id "teamId",r.region_id "regionId",r.client_company_id "clientId"
        FROM proposals p JOIN requests r ON r.id=p.request_id WHERE p.id=${id}::uuid FOR UPDATE
      `;
      if(!row)throw new Error("КП не найдено");
      if(!canReadRow(actor.access,"sales.proposal.client_decision",row,actor))throw new AccessDeniedError("sales.proposal.client_decision");
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
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректное действие",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
