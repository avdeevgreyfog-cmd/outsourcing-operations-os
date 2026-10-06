import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { createBlankIntakeLink, getActiveBlankIntakeLink } from "@/lib/commercial/request-workflow-server";

const schema = z.object({ expiresInDays: z.number().int().min(1).max(365).nullable().default(null) });

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getActiveBlankIntakeLink(actor));
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await createBlankIntakeLink(actor, body.expiresInDays), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректный срок ссылки" }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
