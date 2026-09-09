import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability, AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(180),
  phone: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(240).optional(),
});

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(240).optional(),
  inn: z.string().trim().max(20).optional(),
  regionId: z.string().uuid().optional(),
  contact: contactSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Необходимо войти в систему" }, { status: 401 });
    requireCapability(actor, "sales.client.create");
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });

    const body = schema.parse(await request.json());
    const row = await withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
      const [created] = await tx<Array<{ id: string; name: string; legalName: string | null; status: string }>>`
        INSERT INTO client_companies (
          organization_id,name,legal_name,inn,owner_user_id,created_by_user_id,assigned_team_id,region_id
        ) VALUES (
          ${actor.organizationId}::uuid,${body.name},${body.legalName || null},${body.inn || null},
          ${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0] ?? null}::uuid,${body.regionId ?? null}::uuid
        )
        RETURNING id,name,legal_name "legalName",status
      `;

      if (body.contact) {
        await tx`
          INSERT INTO contacts (
            organization_id,client_company_id,full_name,phone,email,owner_user_id,created_by_user_id
          ) VALUES (
            ${actor.organizationId}::uuid,${created.id}::uuid,${body.contact.name},${body.contact.phone || null},${body.contact.email || null},
            ${actor.userId}::uuid,${actor.userId}::uuid
          )
        `;
      }

      return created;
    }));

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте заполненные поля", issues: error.issues }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав для создания клиента" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать клиента" }, { status: 500 });
  }
}
