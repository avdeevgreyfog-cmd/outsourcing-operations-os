import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRequestIntake } from "@/lib/commercial/request-intake";
import { submitPublicRequest } from "@/lib/commercial/request-intake-server";

const roleSchema = z.object({
  id: z.union([z.string().uuid(), z.literal("")]).optional().transform((value) => value || undefined),
  specialtyId: z.string().uuid(),
  count: z.number().int().positive().max(5000),
  schedule: z.record(z.string(), z.json()).default({}),
  requirements: z.record(z.string(), z.json()).default({}),
  targetClientRate: z.number().nonnegative().nullable().default(null),
});

const schema = z.object({
  title: z.string().trim().min(3).max(240),
  location: z.string().trim().max(300).nullable().default(""),
  regionId: z.string().uuid().nullable().default(null),
  startDate: z.string().date().nullable().default(null),
  durationText: z.string().trim().max(120).nullable().default(null),
  schedule: z.record(z.string(), z.json()).default({}),
  lunchPaid: z.boolean().default(false),
  vatMode: z.string().trim().max(40).nullable().default(null),
  housingRule: z.string().trim().max(240).nullable().default(null),
  travelRule: z.string().trim().max(240).nullable().default(null),
  shuttleRule: z.string().trim().max(240).nullable().default(null),
  ppeRule: z.string().trim().max(300).nullable().default(null),
  medicalRule: z.string().trim().max(300).nullable().default(null),
  citizenshipRule: z.string().trim().max(500).nullable().default(null),
  toolsRule: z.string().trim().max(240).nullable().default(null),
  comments: z.string().trim().max(3000).nullable().default(null),
  intake: z.record(z.string(), z.json()).default({}),
  roles: z.array(roleSchema).max(40).default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = schema.parse(await request.json());
    const payload = { ...body, intake: normalizeRequestIntake(body.intake) };
    const result = await submitPublicRequest(token, payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте заполнение формы", issues: error.issues }, { status: 400 });
    const message = error instanceof Error ? error.message : "Не удалось отправить форму";
    const duplicate = message.includes("unique") || message.includes("duplicate");
    return NextResponse.json({ error: duplicate ? "Предыдущая версия уже отправлена и ждёт проверки менеджером" : message }, { status: duplicate ? 409 : 500 });
  }
}
