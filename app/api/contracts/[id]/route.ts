import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const editSchema = z.object({
  action: z.literal("edit"),
  title: z.string().trim().min(2).max(240),
  number: z.string().trim().max(120).nullable().optional(),
  kind: z.enum(["master","framework","specification","addendum"]),
  parentContractId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.string().date().nullable().optional(),
  effectiveTo: z.string().date().nullable().optional(),
  paymentTerms: z.string().trim().max(2000).nullable().optional(),
  paymentDelayDays: z.number().int().min(0).max(3650).nullable().optional(),
  billingBasis: z.string().trim().max(1200).nullable().optional(),
  timesheetRule: z.string().trim().max(1200).nullable().optional(),
  minimumVolume: z.string().trim().max(1200).nullable().optional(),
  sla: z.string().trim().max(2000).nullable().optional(),
  penalties: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  documentReference: z.string().trim().max(1000).nullable().optional(),
});
const actionSchema = z.object({ action: z.enum(["negotiate","signing","sign","terminate"]), note: z.string().trim().max(2000).optional() });
const exceptionSchema = z.object({ action: z.literal("launch_exception"), reason: z.string().trim().min(5).max(2000) });
const schema = z.discriminatedUnion("action", [editSchema, actionSchema, exceptionSchema]);

type ContractScope = {
  id:string; organizationId:string; clientId:string; requestId:string; proposalId:string|null; objectId:string|null;
  ownerUserId:string|null; createdByUserId:string; status:string; launchGate:string; currentVersionId:string|null;
};

async function unlockLaunch(tx: any, contract: ContractScope, gate: "ready"|"exception") {
  await tx`UPDATE contracts SET launch_gate=${gate},updated_at=now() WHERE id=${contract.id}::uuid`;
  if (contract.objectId) {
    await tx`UPDATE objects SET status='launch',contract_id=${contract.id}::uuid,updated_at=now() WHERE id=${contract.objectId}::uuid`;
    await tx`UPDATE launches SET phase='ready' WHERE object_id=${contract.objectId}::uuid`;
  }
  await tx`UPDATE requests SET status='launch_ready',updated_at=now() WHERE id=${contract.requestId}::uuid`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{id:string}> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    if (actor.demo) return NextResponse.json({error:"Демонстрационные договоры доступны только для просмотра"},{status:409});
    const { id } = await params;
    const body = schema.parse(await request.json());
    const capability = body.action === "sign" ? "contract.sign" : body.action === "launch_exception" ? "contract.launch_exception" : "contract.edit";
    requireCapability(actor, capability);

    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      const [contract] = await tx<Array<ContractScope>>`
        SELECT c.id,c.organization_id "organizationId",c.client_company_id "clientId",c.request_id "requestId",c.proposal_id "proposalId",
          c.object_id "objectId",c.owner_user_id "ownerUserId",c.created_by_user_id "createdByUserId",c.status,c.launch_gate "launchGate",
          c.current_version_id "currentVersionId"
        FROM contracts c WHERE c.id=${id}::uuid FOR UPDATE
      `;
      if (!contract) throw new Error("Договор не найден");
      if (!canReadRow(actor.access, capability, contract, actor)) throw new AccessDeniedError(capability);

      if (body.action === "edit") {
        if (!["draft","negotiation","rejected"].includes(contract.status)) throw new Error("Редактировать условия можно только в черновике или на переговорах");
        if (body.effectiveFrom && body.effectiveTo && body.effectiveTo < body.effectiveFrom) throw new Error("Дата окончания не может быть раньше даты начала");
        if (body.parentContractId) {
          const [parent] = await tx<Array<{clientId:string;status:string}>>`SELECT client_company_id "clientId",status FROM contracts WHERE id=${body.parentContractId}::uuid`;
          if (!parent || parent.clientId !== contract.clientId || parent.status !== "signed") throw new Error("Связать можно только подписанный рамочный договор этого клиента");
        }
        const [current] = contract.currentVersionId ? await tx<Array<{version:number;status:string;terms:Record<string,unknown>}>>`
          SELECT version,status,terms_snapshot terms FROM contract_versions WHERE id=${contract.currentVersionId}::uuid
        ` : [];
        const nextVersion = (current?.version ?? 0) + 1;
        const previousTerms = current?.terms ?? {};
        const terms = {
          ...previousTerms,
          paymentTerms: body.paymentTerms ?? null,
          paymentDelayDays: body.paymentDelayDays ?? null,
          billingBasis: body.billingBasis ?? null,
          timesheetRule: body.timesheetRule ?? null,
          minimumVolume: body.minimumVolume ?? null,
          sla: body.sla ?? null,
          penalties: body.penalties ?? null,
          notes: body.notes ?? null,
        };
        if (contract.currentVersionId && current?.status !== "signed") await tx`UPDATE contract_versions SET status='superseded' WHERE id=${contract.currentVersionId}::uuid`;
        const [version] = await tx<Array<{id:string}>>`
          INSERT INTO contract_versions(organization_id,contract_id,version,status,terms_snapshot,document_reference,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${nextVersion},'draft',${sql.json(terms)},${body.documentReference??null},${actor.userId}::uuid)
          RETURNING id
        `;
        await tx`
          UPDATE contracts SET title=${body.title},number=${body.number??null},kind=${body.kind},parent_contract_id=${body.parentContractId??null}::uuid,
            effective_from=${body.effectiveFrom??null}::date,effective_to=${body.effectiveTo??null}::date,current_version_id=${version.id}::uuid,
            status=CASE WHEN status='rejected' THEN 'negotiation' ELSE status END,updated_at=now()
          WHERE id=${id}::uuid
        `;
        return {id,status:contract.status,version:nextVersion};
      }

      if (body.action === "negotiate") {
        if (!["draft","approved","signing","rejected"].includes(contract.status)) throw new Error("На этом этапе договор нельзя вернуть в переговоры");
        await tx`UPDATE contracts SET status='negotiation',updated_at=now() WHERE id=${id}::uuid`;
      } else if (body.action === "signing") {
        if (contract.status !== "approved") throw new Error("На подписание можно отправить только внутренне согласованный договор");
        await tx`UPDATE contracts SET status='signing',updated_at=now() WHERE id=${id}::uuid`;
      } else if (body.action === "sign") {
        if (!["approved","signing"].includes(contract.status)) throw new Error("Подписать можно только согласованный договор");
        if (!contract.currentVersionId) throw new Error("У договора нет зафиксированной версии условий");
        await tx`UPDATE contract_versions SET status='signed',signed_by_user_id=${actor.userId}::uuid,signed_at=now() WHERE id=${contract.currentVersionId}::uuid`;
        await tx`UPDATE contracts SET status='signed',signed_at=now(),launch_gate='ready',updated_at=now() WHERE id=${id}::uuid`;
        await unlockLaunch(tx, contract, "ready");
      } else if (body.action === "launch_exception") {
        if (contract.status === "signed") throw new Error("Договор уже подписан; исключение не требуется");
        await tx`UPDATE contracts SET launch_gate='exception',launch_exception_reason=${body.reason},launch_exception_by_user_id=${actor.userId}::uuid,launch_exception_at=now(),updated_at=now() WHERE id=${id}::uuid`;
        await unlockLaunch(tx, contract, "exception");
      } else if (body.action === "terminate") {
        if (contract.status !== "signed") throw new Error("Завершить можно только подписанный договор");
        await tx`UPDATE contracts SET status='terminated',updated_at=now() WHERE id=${id}::uuid`;
      }

      if (body.action !== "edit") {
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'contract',${id}::uuid,${body.action},${`Действие по договору: ${body.action}`},${sql.json({note:"note" in body ? body.note??null : "reason" in body ? body.reason : null})})`;
      }
      return {id,action:body.action};
    }));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные договора",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
