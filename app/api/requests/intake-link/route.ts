import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { createBlankIntakeLink, getActiveBlankIntakeLink, revokeBlankIntakeLink } from "@/lib/commercial/request-workflow-server";
import { AccessDeniedError } from "@/lib/access/server";
import { PublicIntakeInputError } from "@/lib/commercial/public-intake-validation";

const schema = z.object({ expiresInDays: z.number().int().min(1).max(365).nullable().default(null) });

export async function GET() {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Войдите в систему" }, { status: 401 });
    return NextResponse.json(await getActiveBlankIntakeLink(actor));
  } catch (error) { return linkError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Войдите в систему" }, { status: 401 });
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await createBlankIntakeLink(actor, body.expiresInDays), { status: 201 });
  } catch (error) {
    return linkError(error);
  }
}

export async function DELETE() {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Войдите в систему" }, { status: 401 });
    await revokeBlankIntakeLink(actor);
    return NextResponse.json({ revoked: true });
  } catch (error) { return linkError(error); }
}

function linkError(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректный срок ссылки" }, { status: 400 });
  if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Нет права создавать заявки и управлять внешней формой" }, { status: 403 });
  if (error instanceof PublicIntakeInputError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось изменить ссылку" }, { status: 500 });
}
