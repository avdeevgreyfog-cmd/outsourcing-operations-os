import { NextResponse } from "next/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { getCurrentActor } from "@/lib/auth/server";
import { withTenant } from "@/lib/db/client";

const allowed = new Set(["organization_units", "positions", "staff_positions", "position_assignments", "process_roles", "membership_process_roles", "responsibility_rules", "organization_change_sets"]);

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401 });
    requireCapability(actor, "organization.read");
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!allowed.has(type) || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Некорректный запрос истории" }, { status: 400 });
    if (actor.demo) return NextResponse.json({ items: [] });
    const items = await withTenant(actor.organizationId, actor.userId, (sql) => sql<Array<{ id: string; action: string; actor: string | null; before: unknown; after: unknown; reason: string | null; createdAt: string }>>`
      SELECT ae.id,ae.action,u.display_name actor,ae.before_json before,ae.after_json after,ae.reason,ae.created_at::text "createdAt"
      FROM audit_events ae LEFT JOIN app_users u ON u.id=ae.actor_user_id
      WHERE ae.resource_type=${type} AND ae.resource_id=${id}::uuid
      ORDER BY ae.created_at DESC LIMIT 100
    `);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось загрузить историю" }, { status: 500 });
  }
}
