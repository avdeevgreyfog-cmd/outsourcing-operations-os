import type { Actor } from "@/lib/access/types";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { listIncidents, type WorkerRow } from "@/lib/data/service";
import { withTenant } from "@/lib/db/client";

export type WorkerDocumentRecord = {
  id: string;
  name: string;
  object: string;
  status: "checked" | "reported" | "missing";
  updatedAt: string;
};

export type WorkerIncidentRecord = {
  id: string;
  title: string;
  object: string;
  status: string;
  occurredAt: string;
};

export type WorkerHistoryRecord = {
  id: string;
  date: string;
  title: string;
  object: string;
  detail: string;
};

export type WorkerRecords = {
  documents: WorkerDocumentRecord[];
  incidents: WorkerIncidentRecord[];
  history: WorkerHistoryRecord[];
};

type WorkerContextRow = {
  organizationId: string;
  objectId: string | null;
  regionId: string | null;
  ownerUserId: string | null;
  assigneeUserIds: string[];
};

type ScopedWorkerContextRow = WorkerContextRow & {
  id: string;
  object: string;
};

function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}

const documentNames: Record<string, string> = {
  passport: "Паспорт",
  snils: "СНИЛС",
  inn: "ИНН",
  bank_details: "Банковские реквизиты",
  military: "Военный билет",
  medical_book: "Медицинская книжка",
  photo: "Фотография",
  application: "Заявление",
  contract: "Договор",
};

const relationNames: Record<string, string> = {
  employment: "Трудовой договор",
  gph: "ГПХ",
  npd: "Самозанятость",
  custom: "Другое оформление",
};

function isReadableWorker(actor: Actor, worker: WorkerRow): boolean {
  return worker.organizationId === actor.organizationId && canReadRow(
    actor.access,
    "worker.read",
    worker,
    actor,
  );
}

function readableObjectRows<T extends ScopedWorkerContextRow>(actor: Actor, rows: T[]): T[] {
  return rows.filter((row) => row.organizationId === actor.organizationId && canReadRow(
    actor.access,
    "worker.read",
    row,
    actor,
  ));
}

function relationHistory(rows: Array<{
  id: string;
  relationType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  contractReference: string | null;
}>): WorkerHistoryRecord[] {
  return rows.map((row) => {
    const start = row.effectiveFrom;
    const end = row.effectiveTo;
    const period = end ? `С ${formatDate(start)} по ${formatDate(end)}` : `С ${formatDate(start)}`;
    const reference = row.contractReference?.trim();
    return {
      id: `relation:${row.id}`,
      date: start,
      title: `Оформление: ${relationNames[row.relationType] ?? "Другой формат"}`,
      object: "",
      detail: [period, reference ? `Договор №${reference}` : ""].filter(Boolean).join(" · "),
    };
  });
}

function projectIncidents(actor: Actor, workerId: string, rows: Awaited<ReturnType<typeof listIncidents>>): WorkerIncidentRecord[] {
  return rows
    .filter((incident) => incident.workerId === workerId && canReadRow(actor.access, "worker.read", incident, actor))
    .sort((a, b) => (b.occurredAtIso ?? "").localeCompare(a.occurredAtIso ?? ""))
    .slice(0, 100)
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      object: incident.object,
      status: incident.status,
      occurredAt: incident.occurredAtIso ?? "",
    }));
}

export async function getWorkerRecords(actor: Actor, worker: WorkerRow): Promise<WorkerRecords> {
  requireCapability(actor, "worker.read");
  if (!isReadableWorker(actor, worker)) throw new AccessDeniedError("worker.read");

  if (actor.demo) {
    const history = worker.startDate || worker.object ? [{
      id: `worker-start:${worker.id}`,
      date: worker.startDate ?? "",
      title: "Назначение на объект",
      object: worker.object ?? "",
      detail: "",
    }] : [];
    const incidents = hasCapability(actor.access, "operations.object.read")
      ? projectIncidents(actor, worker.id, await listIncidents(actor))
      : [];
    return { documents: [], incidents, history };
  }

  const incidents = hasCapability(actor.access, "operations.object.read")
    ? projectIncidents(actor, worker.id, await listIncidents(actor))
    : [];

  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [documents, assignments, relations] = await Promise.all([
      sql<Array<ScopedWorkerContextRow & {
        id: string;
        documentCode: string;
        employeeReportedAt: string | null;
        managerVerifiedAt: string | null;
        updatedAt: string;
      }>>`
        SELECT d.id,d.organization_id "organizationId",d.document_code "documentCode",
          d.employee_reported_at::text "employeeReportedAt",d.manager_verified_at::text "managerVerifiedAt",d.updated_at::text "updatedAt",
          o.id "objectId",o.name object,o.region_id "regionId",o.owner_user_id "ownerUserId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || ARRAY[o.owner_user_id::text] "assigneeUserIds"
        FROM worker_document_checklist d
        JOIN worker_profiles w ON w.id=d.worker_id AND w.organization_id=d.organization_id
        JOIN objects o ON o.id=d.object_id AND o.organization_id=d.organization_id
        WHERE d.worker_id=${worker.id}::uuid AND d.organization_id=${actor.organizationId}::uuid
        ORDER BY d.updated_at DESC
      `,
      sql<Array<ScopedWorkerContextRow & {
        id: string;
        effectiveFrom: string;
        effectiveTo: string | null;
        specialty: string | null;
        workMode: string | null;
      }>>`
        SELECT wa.id,wa.organization_id "organizationId",wa.object_id "objectId",o.name object,o.region_id "regionId",
          o.owner_user_id "ownerUserId",wa.manager_user_id "managerUserId",wa.effective_from::text "effectiveFrom",
          wa.effective_to::text "effectiveTo",s.name specialty,wa.work_mode "workMode",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || ARRAY[o.owner_user_id::text,wa.manager_user_id::text] "assigneeUserIds"
        FROM worker_object_assignments wa
        JOIN worker_profiles w ON w.id=wa.worker_id AND w.organization_id=wa.organization_id
        JOIN objects o ON o.id=wa.object_id AND o.organization_id=wa.organization_id
        LEFT JOIN specialties s ON s.id=wa.specialty_id
        WHERE wa.worker_id=${worker.id}::uuid AND wa.organization_id=${actor.organizationId}::uuid
        ORDER BY wa.effective_from DESC
      `,
      sql<Array<{ id: string; relationType: string; effectiveFrom: string; effectiveTo: string | null; contractReference: string | null }>>`
        SELECT id,relation_type "relationType",effective_from::text "effectiveFrom",effective_to::text "effectiveTo",
          contract_reference "contractReference"
        FROM employment_relations
        WHERE worker_id=${worker.id}::uuid AND organization_id=${actor.organizationId}::uuid
        ORDER BY effective_from DESC,created_at DESC LIMIT 200
      `,
    ]);

    const visibleDocuments = readableObjectRows(actor, documents).slice(0, 200).map((row) => ({
      id: row.id,
      name: documentNames[row.documentCode] ?? "Другой документ",
      object: row.object,
      status: (row.managerVerifiedAt ? "checked" : row.employeeReportedAt ? "reported" : "missing") as WorkerDocumentRecord["status"],
      updatedAt: row.updatedAt,
    }));

    const visibleAssignments = readableObjectRows(actor, assignments).slice(0, 100).map((row): WorkerHistoryRecord => {
      const period = row.effectiveTo ? `С ${formatDate(row.effectiveFrom)} по ${formatDate(row.effectiveTo)}` : `С ${formatDate(row.effectiveFrom)}`;
      const detail = [row.specialty ? `Специальность: ${row.specialty}` : "", row.workMode === "rotation" ? "Вахтовый режим" : row.workMode === "local" ? "Местный режим" : "", period]
        .filter(Boolean).join(" · ");
      return { id: `assignment:${row.id}`, date: row.effectiveFrom, title: "Назначение на объект", object: row.object, detail };
    });

    const history = [...visibleAssignments, ...relationHistory(relations)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    return { documents: visibleDocuments, incidents, history };
  });
}
