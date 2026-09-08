import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { getCommercialRequest } from "@/lib/commercial/service";
import { getRequestIntake } from "@/lib/commercial/request-intake-server";
import { calculateRequestCompleteness } from "@/lib/commercial/request-intake";
import { requestStageCodes } from "@/lib/commercial/request-workflow";

const schema = z.object({
  stageCode: z.enum(requestStageCodes),
  lossReason: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCapability(actor, "sales.request.edit");
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const { id } = await params;
    const body = schema.parse(await request.json());
    const current = await getCommercialRequest(actor, id);
    if (!current) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    if (!canReadRow(actor.access, "sales.request.edit", current, actor)) throw new AccessDeniedError("sales.request.edit");
    if (current.archivedAt) throw new Error("Архивную заявку сначала нужно восстановить");

    if (body.stageCode === "ready_calc") {
      const intake = await getRequestIntake(actor, id);
      const completeness = calculateRequestCompleteness(current, intake);
      if (!completeness.ready) throw new Error(`Заявка ещё не готова к расчёту: ${completeness.missing.slice(0,4).join(", ")}`);
    }
    if (body.stageCode === "proposal_client") {
      const available = await withTenant(actor.organizationId, actor.userId, async (sql) => sql<Array<{ok:boolean}>>`
        SELECT EXISTS(SELECT 1 FROM proposals WHERE request_id=${id}::uuid AND sent_at IS NOT NULL) ok
      `);
      if (!available[0]?.ok) throw new Error("Сначала подготовьте и отправьте хотя бы одну версию КП");
    }
    if (body.stageCode === "agreed") {
      const available = await withTenant(actor.organizationId, actor.userId, async (sql) => sql<Array<{ok:boolean}>>`
        SELECT EXISTS(SELECT 1 FROM proposals WHERE request_id=${id}::uuid AND accepted_at IS NOT NULL) ok
      `);
      if (!available[0]?.ok) throw new Error("Этап «Согласовано» доступен только после принятия заказчиком версии КП");
    }
    if (body.stageCode === "not_agreed" && !body.lossReason?.trim()) throw new Error("Укажите причину, почему предложение не согласовано");

    await withTenant(actor.organizationId, actor.userId, async (sql) => sql`
      UPDATE requests SET workflow_stage_code=${body.stageCode},
        loss_reason=CASE WHEN ${body.stageCode}='not_agreed' THEN ${body.lossReason ?? null} ELSE NULL END,
        lost_at=CASE WHEN ${body.stageCode}='not_agreed' THEN COALESCE(lost_at,now()) ELSE NULL END,
        won_at=CASE WHEN ${body.stageCode}='agreed' THEN COALESCE(won_at,now()) ELSE NULL END,
        closed_at=CASE WHEN ${body.stageCode} IN ('agreed','not_agreed') THEN COALESCE(closed_at,now()) ELSE NULL END,
        updated_at=now() WHERE id=${id}::uuid
    `);
    return NextResponse.json({ id, stageCode: body.stageCode });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректный этап" }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
