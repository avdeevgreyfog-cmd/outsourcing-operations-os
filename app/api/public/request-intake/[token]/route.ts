import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRequestIntake } from "@/lib/commercial/request-intake";
import { submitBlankRequest } from "@/lib/commercial/request-workflow-server";

const role = z.object({
  specialtyId: z.string().uuid().nullable().optional(), specialtyName: z.string().trim().min(2).max(160), count: z.number().int().positive().max(5000),
  schedule: z.record(z.string(), z.json()).default({}), requirements: z.record(z.string(), z.json()).default({}), targetClientRate: z.number().nonnegative().nullable().default(null),
});
const schema = z.object({
  companyName: z.string().trim().max(240).default(""), title: z.string().trim().min(3).max(240), source: z.string().trim().max(120).default("public_form"),
  location: z.string().trim().max(500).default(""), regionId: z.string().uuid().nullable().default(null), startDate: z.string().date().nullable().default(null),
  durationText: z.string().trim().max(160).nullable().default(null), schedule: z.record(z.string(), z.json()).default({}), intake: z.record(z.string(), z.json()).default({}),
  lunchPaid: z.boolean().default(false), vatMode: z.string().trim().max(40).nullable().default(null), comments: z.string().trim().max(5000).nullable().default(null),
  roles: z.array(role).min(1).max(250),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = schema.parse(await request.json());
    const result = await submitBlankRequest(token, { ...body, intake: normalizeRequestIntake(body.intake) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте обязательные поля", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось отправить заявку" }, { status: 500 });
  }
}
