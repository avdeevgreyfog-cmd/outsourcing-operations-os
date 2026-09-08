import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError } from "@/lib/access/server";
import { createRequestPublicLink, revokeRequestPublicLink } from "@/lib/commercial/request-intake";

const createSchema = z.object({ expiresInDays: z.number().int().min(1).max(90).nullable().default(14) });
const revokeSchema = z.object({ linkId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const { id } = await params;
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const result = await createRequestPublicLink(actor, id, body.expiresInDays);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректный срок действия ссылки" }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const { id } = await params;
    const body = revokeSchema.parse(await request.json());
    return NextResponse.json(await revokeRequestPublicLink(actor, id, body.linkId));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
