import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { getCommercialRequest } from "@/lib/commercial/service";

const roleSchema = z.object({
  id: z.string().uuid().optional(),
  specialtyId: z.string().uuid(),
  count: z.number().int().positive().max(5000),
  schedule: z.record(z.string(), z.json()).default({}),
  requirements: z.record(z.string(), z.json()).default({}),
  targetClientRate: z.number().nonnegative().nullable().optional(),
});

const schema = z.object({
  action: z.enum(["update", "archive", "restore"]).default("update"),
  clientId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(240).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(300).optional(),
  regionId: z.string().uuid().nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  durationText: z.string().trim().max(120).nullable().optional(),
  schedule: z.record(z.string(), z.json()).optional(),
  intake: z.record(z.string(), z.json()).optional(),
  lunchPaid: z.boolean().nullable().optional(),
  vatMode: z.string().trim().max(40).nullable().optional(),
  housingRule: z.string().trim().max(120).nullable().optional(),
  travelRule: z.string().trim().max(120).nullable().optional(),
  shuttleRule: z.string().trim().max(120).nullable().optional(),
  ppeRule: z.string().trim().max(120).nullable().optional(),
  medicalRule: z.string().trim().max(120).nullable().optional(),
  citizenshipRule: z.string().trim().max(120).nullable().optional(),
  toolsRule: z.string().trim().max(120).nullable().optional(),
  comments: z.string().trim().max(3000).nullable().optional(),
  roles: z.array(roleSchema).max(40).optional(),
});

function asJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.demo) return NextResponse.json({ error: "Демонстрационные данные доступны только для чтения" }, { status: 409 });
    const { id } = await params;
    const body = schema.parse(await request.json());
    const current = await getCommercialRequest(actor, id);
    if (!current) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    const capability = body.action === "archive" || body.action === "restore" ? "sales.request.archive" : "sales.request.edit";
    requireCapability(actor, capability);
    if (!canReadRow(actor.access, capability, current, actor)) throw new AccessDeniedError(capability);

    const result = await withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
      if (body.action === "archive") {
        if (current.archivedAt) return { id, status: current.status, archived: true };
        await tx`UPDATE requests SET archived_at=now(),archived_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
        return { id, status: current.status, archived: true };
      }
      if (body.action === "restore") {
        await tx`UPDATE requests SET archived_at=NULL,archived_by_user_id=NULL,updated_at=now() WHERE id=${id}::uuid`;
        return { id, status: current.status, archived: false };
      }

      if (current.archivedAt) throw new Error("Сначала восстановите заявку из архива");
      if (["accepted","launched"].includes(current.status)) throw new Error("Принятая клиентом или переданная в запуск заявка зафиксирована. Для изменения коммерческих условий создайте новый цикл/версию до принятия КП");

      const nextClientId = body.clientId === undefined ? current.clientId : body.clientId;
      if (nextClientId) {
        const [client] = await tx<Array<{ id: string }>>`SELECT id FROM client_companies WHERE id=${nextClientId}::uuid`;
        if (!client) throw new Error("Клиент не найден в текущей организации");
      }
      if (body.regionId) {
        const [region] = await tx<Array<{ id: string }>>`SELECT id FROM regions WHERE id=${body.regionId}::uuid`;
        if (!region) throw new Error("Регион не найден в текущей организации");
      }

      await tx`
        UPDATE requests SET
          client_company_id=${nextClientId}::uuid,
          title=${body.title ?? current.title},source=${body.source ?? current.source},
          location_text=${body.location ?? current.location},region_id=${body.regionId === undefined ? current.regionId : body.regionId}::uuid,
          expected_start_date=${body.startDate === undefined ? current.startDate : body.startDate}::date,
          duration_text=${body.durationText === undefined ? current.durationText : body.durationText},
          schedule_json=${sql.json(asJsonValue(body.schedule ?? current.schedule))},
          intake_json=CASE WHEN ${body.intake === undefined} THEN intake_json ELSE ${sql.json(asJsonValue(body.intake ?? {}))} END,
          lunch_paid=${body.lunchPaid === undefined ? current.lunchPaid : body.lunchPaid},
          vat_mode=${body.vatMode === undefined ? current.vatMode : body.vatMode},housing_rule=${body.housingRule === undefined ? current.housingRule : body.housingRule},
          travel_rule=${body.travelRule === undefined ? current.travelRule : body.travelRule},shuttle_rule=${body.shuttleRule === undefined ? current.shuttleRule : body.shuttleRule},
          ppe_rule=${body.ppeRule === undefined ? current.ppeRule : body.ppeRule},medical_rule=${body.medicalRule === undefined ? current.medicalRule : body.medicalRule},
          citizenship_rule=${body.citizenshipRule === undefined ? current.citizenshipRule : body.citizenshipRule},tools_rule=${body.toolsRule === undefined ? current.toolsRule : body.toolsRule},
          comments=${body.comments === undefined ? current.comments : body.comments},updated_at=now()
        WHERE id=${id}::uuid
      `;

      if (body.roles) {
        const supplied = new Set(body.roles.flatMap((role) => role.id ? [role.id] : []));
        const linkedIds = await tx<Array<{ id: string }>>`
          SELECT DISTINCT request_role_id id FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE c.request_id=${id}::uuid
        `;
        for (const role of body.roles) {
          if (role.id) {
            const oldRole=current.roles.find((item)=>item.id===role.id);
            if(oldRole&&linkedIds.some((item)=>item.id===role.id)&&oldRole.specialtyId!==role.specialtyId){
              throw new Error("Нельзя менять профессию позиции после создания расчёта. Добавьте новую позицию, чтобы сохранить историю");
            }
            await tx`
              UPDATE request_roles SET specialty_id=${role.specialtyId}::uuid,count_required=${role.count},schedule_json=${sql.json(role.schedule)},
                requirements_json=${sql.json(role.requirements)},target_client_rate=${role.targetClientRate ?? null}
              WHERE id=${role.id}::uuid AND request_id=${id}::uuid
            `;
          } else {
            await tx`
              INSERT INTO request_roles(organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json,target_client_rate)
              VALUES (${actor.organizationId}::uuid,${id}::uuid,${role.specialtyId}::uuid,${role.count},${sql.json(role.schedule)},${sql.json(role.requirements)},${role.targetClientRate ?? null})
            `;
          }
        }
        for (const oldRole of current.roles) {
          if (supplied.has(oldRole.id)) continue;
          if (linkedIds.some((item) => item.id === oldRole.id)) {
            throw new Error("Нельзя удалить позицию заявки, по которой уже существует расчёт");
          }
          await tx`DELETE FROM request_roles WHERE id=${oldRole.id}::uuid AND request_id=${id}::uuid`;
        }
      }
      return { id, status: current.status, archived: false };
    }));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте заполнение полей", issues: error.issues }, { status: 400 });
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
