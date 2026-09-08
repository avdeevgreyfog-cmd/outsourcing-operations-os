import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { requestStageCodes } from "@/lib/commercial/request-workflow";

const item = z.object({ code: z.enum(requestStageCodes), label: z.string().trim().min(2).max(80), color: z.string().trim().max(30), active: z.boolean(), sortOrder: z.number().int().min(1).max(999) });
const schema = z.object({ stages: z.array(item).min(2).max(20) });

function allowed(actor: NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>) {
  return actor.roleCode === "director" || hasCapability(actor.access, "organization.manage") || hasCapability(actor.access, "admin.permissions.manage");
}

export async function PATCH(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!allowed(actor)) return NextResponse.json({ error: "Недостаточно прав для настройки процесса" }, { status: 403 });
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const body = schema.parse(await request.json());
    const codes = new Set(body.stages.map((stage) => stage.code));
    if (!codes.has("new") || !codes.has("agreed") || !codes.has("not_agreed")) return NextResponse.json({ error: "Системные этапы Новая, Согласовано и Не согласовано нельзя удалить" }, { status: 400 });
    await withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
      for (const stage of body.stages) await tx`
        UPDATE request_stage_definitions SET label=${stage.label},color=${stage.color},active=${stage.active},sort_order=${stage.sortOrder},updated_at=now()
        WHERE organization_id=${actor.organizationId}::uuid AND code=${stage.code}
      `;
    }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте настройки этапов" }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
