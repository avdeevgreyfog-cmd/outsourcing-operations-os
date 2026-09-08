import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError } from "@/lib/access/server";
import { reviewPublicSubmission } from "@/lib/commercial/request-intake-server";

const schema = z.object({
  decision: z.enum(["accept", "reject"]),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const { id, submissionId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await reviewPublicSubmission(actor, id, submissionId, body.decision, body.comment ?? null));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Некорректное решение" }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
