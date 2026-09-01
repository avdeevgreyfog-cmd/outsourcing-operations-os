import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  timezone: z.string().trim().min(2).max(80).optional(),
  currency: z.string().trim().length(3).optional(),
});

export async function PATCH(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 });
    requireCapability(actor, "organization.manage");
    if (actor.demo) return NextResponse.json({ error: "В демонстрационном режиме изменения не сохраняются" }, { status: 409 });
    const body = schema.parse(await request.json());
    await withTenant(actor.organizationId, actor.userId, async (sql) => {
      const settings = Object.fromEntries(Object.entries({ timezone: body.timezone, currency: body.currency }).filter(([, value]) => value !== undefined));
      await sql`UPDATE organizations SET name=${body.name},settings=settings||${sql.json(settings)},updated_at=now() WHERE id=${actor.organizationId}::uuid`;
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте заполнение полей", issues: error.issues }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить организацию" }, { status: 500 });
  }
}
