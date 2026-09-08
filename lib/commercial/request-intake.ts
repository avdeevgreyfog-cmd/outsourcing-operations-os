import { randomBytes } from "node:crypto";
import type { Actor } from "@/lib/access/types";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { db, withTenant } from "@/lib/db/client";
import { getCommercialRequest, type CommercialRequestDetail } from "@/lib/commercial/service";

export const provisionKeys = ["housing","travel","shuttle","meals","workwear","ppe","tools","consumables","medical","medbook","training"] as const;
export type ProvisionKey = typeof provisionKeys[number];
export type ProvisionItem = { provider: string; cost: number | null; unit: string; comment: string };

export type RequestIntake = {
  companyName: string;
  object: { siteName: string; city: string; landmark: string; objectType: string };
  contact: { name: string; phone: string; email: string; messengerType: string; messenger: string };
  volume: {
    launchMode: string;
    startHeadcount: number | null;
    demandType: string;
    guaranteedHours: number | null;
    guaranteedShifts: number | null;
    comment: string;
  };
  schedule: {
    pattern: string;
    customPattern: string;
    shiftStart: string;
    shiftEnd: string;
    presenceHours: number | null;
    paidHours: number | null;
    lunchMinutes: number | null;
    lunchPaid: boolean;
    shiftType: string;
    rotationDays: number | null;
    overtimeNotes: string;
  };
  provision: Record<ProvisionKey, ProvisionItem>;
  compliance: {
    securityCheck: string;
    workerCategories: string[];
    documentChecks: string[];
    comment: string;
  };
  commercial: {
    billingUnit: string;
    clientLimit: number | null;
    clientLimitVatMode: string;
    desiredWorkerNet: number | null;
    desiredWorkerNetUnit: string;
    competitorRate: number | null;
    competitorRateVatMode: string;
    competitorComment: string;
    paymentTerms: string;
  };
  sectionComments: Record<string, string>;
};

export type PublicRolePayload = {
  id?: string;
  specialtyId: string;
  count: number;
  schedule: Record<string, unknown>;
  requirements: Record<string, unknown>;
  targetClientRate: number | null;
};

export type PublicRequestSubmissionPayload = {
  title: string;
  location: string | null;
  regionId: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: Record<string, unknown>;
  lunchPaid: boolean;
  vatMode: string | null;
  housingRule: string | null;
  travelRule: string | null;
  shuttleRule: string | null;
  ppeRule: string | null;
  medicalRule: string | null;
  citizenshipRule: string | null;
  toolsRule: string | null;
  comments: string | null;
  intake: RequestIntake;
  roles: PublicRolePayload[];
};

export type RequestPublicLinkRow = {
  id: string;
  path: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
  submittedAt: string | null;
};

export type RequestPublicSubmissionRow = {
  id: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
  payload: PublicRequestSubmissionPayload;
};

export type RequestExternalState = {
  links: RequestPublicLinkRow[];
  submissions: RequestPublicSubmissionRow[];
};

export type PublicRequestContext = {
  organizationName: string;
  requestId: string;
  title: string;
  company: string;
  location: string;
  regionId: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: Record<string, unknown>;
  lunchPaid: boolean;
  vatMode: string | null;
  housingRule: string | null;
  travelRule: string | null;
  shuttleRule: string | null;
  ppeRule: string | null;
  medicalRule: string | null;
  citizenshipRule: string | null;
  toolsRule: string | null;
  comments: string | null;
  intake: RequestIntake;
  roles: Array<{
    id: string;
    specialtyId: string;
    specialty: string;
    count: number;
    schedule: Record<string, unknown>;
    requirements: Record<string, unknown>;
    targetClientRate: number | null;
  }>;
  specialties: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  expiresAt: string | null;
};

const emptyProvision = (): Record<ProvisionKey, ProvisionItem> => Object.fromEntries(
  provisionKeys.map((key) => [key, { provider: "unknown", cost: null, unit: "", comment: "" }]),
) as Record<ProvisionKey, ProvisionItem>;

export const emptyRequestIntake = (): RequestIntake => ({
  companyName: "",
  object: { siteName: "", city: "", landmark: "", objectType: "" },
  contact: { name: "", phone: "", email: "", messengerType: "", messenger: "" },
  volume: { launchMode: "once", startHeadcount: null, demandType: "fixed", guaranteedHours: null, guaranteedShifts: null, comment: "" },
  schedule: { pattern: "", customPattern: "", shiftStart: "", shiftEnd: "", presenceHours: null, paidHours: null, lunchMinutes: 60, lunchPaid: false, shiftType: "day", rotationDays: null, overtimeNotes: "" },
  provision: emptyProvision(),
  compliance: { securityCheck: "unknown", workerCategories: [], documentChecks: [], comment: "" },
  commercial: { billingUnit: "unknown", clientLimit: null, clientLimitVatMode: "with_vat", desiredWorkerNet: null, desiredWorkerNetUnit: "month", competitorRate: null, competitorRateVatMode: "with_vat", competitorComment: "", paymentTerms: "" },
  sectionComments: {},
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function bool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export function normalizeRequestIntake(value: unknown): RequestIntake {
  const base = emptyRequestIntake();
  const root = object(value);
  const objectData = object(root.object);
  const contact = object(root.contact);
  const volume = object(root.volume);
  const schedule = object(root.schedule);
  const provision = object(root.provision);
  const compliance = object(root.compliance);
  const commercial = object(root.commercial);
  const sectionComments = object(root.sectionComments);

  for (const key of provisionKeys) {
    const item = object(provision[key]);
    base.provision[key] = {
      provider: text(item.provider, base.provision[key].provider),
      cost: numberOrNull(item.cost),
      unit: text(item.unit),
      comment: text(item.comment),
    };
  }

  return {
    companyName: text(root.companyName),
    object: {
      siteName: text(objectData.siteName), city: text(objectData.city), landmark: text(objectData.landmark), objectType: text(objectData.objectType),
    },
    contact: {
      name: text(contact.name), phone: text(contact.phone), email: text(contact.email), messengerType: text(contact.messengerType), messenger: text(contact.messenger),
    },
    volume: {
      launchMode: text(volume.launchMode, base.volume.launchMode), startHeadcount: numberOrNull(volume.startHeadcount), demandType: text(volume.demandType, base.volume.demandType),
      guaranteedHours: numberOrNull(volume.guaranteedHours), guaranteedShifts: numberOrNull(volume.guaranteedShifts), comment: text(volume.comment),
    },
    schedule: {
      pattern: text(schedule.pattern), customPattern: text(schedule.customPattern), shiftStart: text(schedule.shiftStart), shiftEnd: text(schedule.shiftEnd),
      presenceHours: numberOrNull(schedule.presenceHours), paidHours: numberOrNull(schedule.paidHours), lunchMinutes: numberOrNull(schedule.lunchMinutes),
      lunchPaid: bool(schedule.lunchPaid), shiftType: text(schedule.shiftType, base.schedule.shiftType), rotationDays: numberOrNull(schedule.rotationDays), overtimeNotes: text(schedule.overtimeNotes),
    },
    provision: base.provision,
    compliance: {
      securityCheck: text(compliance.securityCheck, base.compliance.securityCheck), workerCategories: strings(compliance.workerCategories),
      documentChecks: strings(compliance.documentChecks), comment: text(compliance.comment),
    },
    commercial: {
      billingUnit: text(commercial.billingUnit, base.commercial.billingUnit), clientLimit: numberOrNull(commercial.clientLimit), clientLimitVatMode: text(commercial.clientLimitVatMode, base.commercial.clientLimitVatMode),
      desiredWorkerNet: numberOrNull(commercial.desiredWorkerNet), desiredWorkerNetUnit: text(commercial.desiredWorkerNetUnit, base.commercial.desiredWorkerNetUnit),
      competitorRate: numberOrNull(commercial.competitorRate), competitorRateVatMode: text(commercial.competitorRateVatMode, base.commercial.competitorRateVatMode),
      competitorComment: text(commercial.competitorComment), paymentTerms: text(commercial.paymentTerms),
    },
    sectionComments: Object.fromEntries(Object.entries(sectionComments).filter(([, item]) => typeof item === "string")) as Record<string, string>,
  };
}

export async function getRequestIntake(actor: Actor, requestId: string): Promise<RequestIntake> {
  const request = await getCommercialRequest(actor, requestId);
  if (!request) throw new Error("Заявка не найдена");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [row] = await sql<Array<{ intake: unknown }>>`SELECT intake_json intake FROM requests WHERE id=${requestId}::uuid`;
    return normalizeRequestIntake(row?.intake);
  });
}

export async function getRequestExternalState(actor: Actor, requestId: string): Promise<RequestExternalState> {
  const request = await getCommercialRequest(actor, requestId);
  if (!request) throw new Error("Заявка не найдена");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [links, submissions] = await Promise.all([
      sql<Array<{id:string;token:string;createdAt:string;expiresAt:string|null;revokedAt:string|null;lastOpenedAt:string|null;submittedAt:string|null}>>`
        SELECT id,token,to_char(created_at,'DD.MM.YYYY HH24:MI') "createdAt",expires_at::text "expiresAt",revoked_at::text "revokedAt",
          last_opened_at::text "lastOpenedAt",submitted_at::text "submittedAt"
        FROM request_public_links WHERE request_id=${requestId}::uuid ORDER BY created_at DESC
      `,
      sql<Array<{id:string;status:string;submittedAt:string;reviewedAt:string|null;reviewComment:string|null;payload:unknown}>>`
        SELECT id,status,to_char(submitted_at,'DD.MM.YYYY HH24:MI') "submittedAt",reviewed_at::text "reviewedAt",review_comment "reviewComment",payload
        FROM request_public_submissions WHERE request_id=${requestId}::uuid ORDER BY submitted_at DESC
      `,
    ]);
    return {
      links: links.map((item) => ({ ...item, path: `/request-form/${item.token}` })),
      submissions: submissions.map((item) => ({ ...item, payload: item.payload as PublicRequestSubmissionPayload })),
    };
  });
}

export async function createRequestPublicLink(actor: Actor, requestId: string, expiresInDays: number | null) {
  requireCapability(actor, "sales.request.edit");
  const request = await getCommercialRequest(actor, requestId);
  if (!request) throw new Error("Заявка не найдена");
  if (!canReadRow(actor.access, "sales.request.edit", request, actor)) throw new AccessDeniedError("sales.request.edit");
  const token = randomBytes(24).toString("base64url");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
    await tx`UPDATE request_public_links SET revoked_at=COALESCE(revoked_at,now()) WHERE request_id=${requestId}::uuid AND revoked_at IS NULL`;
    const [row] = await tx<Array<{id:string;expiresAt:string|null}>>`
      INSERT INTO request_public_links(organization_id,request_id,token,created_by_user_id,expires_at)
      VALUES (${actor.organizationId}::uuid,${requestId}::uuid,${token},${actor.userId}::uuid,
        CASE WHEN ${expiresInDays}::int IS NULL THEN NULL ELSE now()+(${expiresInDays}::int * interval '1 day') END)
      RETURNING id,expires_at::text "expiresAt"
    `;
    return { ...row, path: `/request-form/${token}` };
  }));
}

export async function revokeRequestPublicLink(actor: Actor, requestId: string, linkId: string) {
  requireCapability(actor, "sales.request.edit");
  const request = await getCommercialRequest(actor, requestId);
  if (!request) throw new Error("Заявка не найдена");
  if (!canReadRow(actor.access, "sales.request.edit", request, actor)) throw new AccessDeniedError("sales.request.edit");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    await sql`UPDATE request_public_links SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${linkId}::uuid AND request_id=${requestId}::uuid`;
    return { ok: true };
  });
}

export async function getPublicRequestContext(token: string): Promise<PublicRequestContext | null> {
  const sql = db();
  const [link] = await sql<Array<{id:string;organizationId:string;requestId:string;createdByUserId:string;expiresAt:string|null}>>`
    SELECT id,organization_id "organizationId",request_id "requestId",created_by_user_id "createdByUserId",expires_at::text "expiresAt"
    FROM request_public_links
    WHERE token=${token} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
    LIMIT 1
  `;
  if (!link) return null;
  await sql`UPDATE request_public_links SET last_opened_at=now() WHERE id=${link.id}::uuid`;
  return withTenant(link.organizationId, link.createdByUserId, async (tenantSql) => {
    const [request] = await tenantSql<Array<{
      organizationName:string;requestId:string;title:string;company:string;location:string;regionId:string|null;startDate:string|null;durationText:string|null;
      schedule:Record<string,unknown>;lunchPaid:boolean;vatMode:string|null;housingRule:string|null;travelRule:string|null;shuttleRule:string|null;ppeRule:string|null;
      medicalRule:string|null;citizenshipRule:string|null;toolsRule:string|null;comments:string|null;intake:unknown;
    }>>`
      SELECT o.name "organizationName",r.id "requestId",r.title,COALESCE(c.name,'') company,COALESCE(r.location_text,'') location,r.region_id "regionId",
        r.expected_start_date::text "startDate",r.duration_text "durationText",r.schedule_json schedule,COALESCE(r.lunch_paid,false) "lunchPaid",r.vat_mode "vatMode",
        r.housing_rule "housingRule",r.travel_rule "travelRule",r.shuttle_rule "shuttleRule",r.ppe_rule "ppeRule",r.medical_rule "medicalRule",
        r.citizenship_rule "citizenshipRule",r.tools_rule "toolsRule",r.comments,r.intake_json intake
      FROM requests r JOIN organizations o ON o.id=r.organization_id LEFT JOIN client_companies c ON c.id=r.client_company_id
      WHERE r.id=${link.requestId}::uuid
    `;
    if (!request) return null;
    const [roles, specialties, regions] = await Promise.all([
      tenantSql<Array<{id:string;specialtyId:string;specialty:string;count:number;schedule:Record<string,unknown>;requirements:Record<string,unknown>;targetClientRate:number|null}>>`
        SELECT rr.id,rr.specialty_id "specialtyId",s.name specialty,rr.count_required count,rr.schedule_json schedule,rr.requirements_json requirements,rr.target_client_rate::float8 "targetClientRate"
        FROM request_roles rr JOIN specialties s ON s.id=rr.specialty_id WHERE rr.request_id=${link.requestId}::uuid ORDER BY rr.created_at
      `,
      tenantSql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`,
      tenantSql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
    ]);
    return { ...request, intake: normalizeRequestIntake(request.intake), roles, specialties, regions, expiresAt: link.expiresAt };
  });
}

export async function submitPublicRequest(token: string, payload: PublicRequestSubmissionPayload) {
  const sql = db();
  const [link] = await sql<Array<{id:string;organizationId:string;requestId:string}>>`
    SELECT id,organization_id "organizationId",request_id "requestId"
    FROM request_public_links WHERE token=${token} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) LIMIT 1
  `;
  if (!link) throw new Error("Ссылка недействительна или срок её действия истёк");
  const [row] = await sql<Array<{id:string}>>`
    INSERT INTO request_public_submissions(organization_id,request_id,public_link_id,payload)
    VALUES (${link.organizationId}::uuid,${link.requestId}::uuid,${link.id}::uuid,${sql.json(payload)}) RETURNING id
  `;
  await sql`UPDATE request_public_links SET submitted_at=now() WHERE id=${link.id}::uuid`;
  return row;
}

export async function reviewPublicSubmission(actor: Actor, requestId: string, submissionId: string, decision: "accept" | "reject", comment: string | null) {
  requireCapability(actor, "sales.request.edit");
  const current = await getCommercialRequest(actor, requestId);
  if (!current) throw new Error("Заявка не найдена");
  if (!canReadRow(actor.access, "sales.request.edit", current, actor)) throw new AccessDeniedError("sales.request.edit");
  if (current.archivedAt || ["accepted","launched"].includes(current.status)) throw new Error("Зафиксированную заявку нельзя обновить из внешней формы");

  return withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
    const [submission] = await tx<Array<{status:string;payload:PublicRequestSubmissionPayload}>>`
      SELECT status,payload FROM request_public_submissions WHERE id=${submissionId}::uuid AND request_id=${requestId}::uuid FOR UPDATE
    `;
    if (!submission) throw new Error("Версия внешней формы не найдена");
    if (submission.status !== "pending") throw new Error("Эта версия уже обработана");

    if (decision === "reject") {
      await tx`UPDATE request_public_submissions SET status='rejected',reviewed_by_user_id=${actor.userId}::uuid,reviewed_at=now(),review_comment=${comment} WHERE id=${submissionId}::uuid`;
      return { status: "rejected" };
    }

    const payload = submission.payload;
    for (const role of payload.roles) {
      const [specialty] = await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE id=${role.specialtyId}::uuid AND active`;
      if (!specialty) throw new Error("Одна из выбранных специальностей больше недоступна. Проверьте заявку вручную");
    }

    await tx`
      UPDATE requests SET title=${payload.title},location_text=${payload.location},region_id=${payload.regionId}::uuid,
        expected_start_date=${payload.startDate}::date,duration_text=${payload.durationText},schedule_json=${sql.json(payload.schedule)},lunch_paid=${payload.lunchPaid},
        vat_mode=${payload.vatMode},housing_rule=${payload.housingRule},travel_rule=${payload.travelRule},shuttle_rule=${payload.shuttleRule},ppe_rule=${payload.ppeRule},
        medical_rule=${payload.medicalRule},citizenship_rule=${payload.citizenshipRule},tools_rule=${payload.toolsRule},comments=${payload.comments},
        intake_json=${sql.json(payload.intake)},updated_at=now()
      WHERE id=${requestId}::uuid
    `;

    const linkedIds = await tx<Array<{id:string}>>`
      SELECT DISTINCT request_role_id id FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE c.request_id=${requestId}::uuid
    `;
    const suppliedIds = new Set(payload.roles.flatMap((role) => role.id ? [role.id] : []));
    for (const role of payload.roles) {
      if (role.id) {
        const oldRole = current.roles.find((item) => item.id === role.id);
        if (oldRole && linkedIds.some((item) => item.id === role.id) && oldRole.specialtyId !== role.specialtyId) {
          throw new Error("Нельзя менять специальность позиции, по которой уже создан расчёт");
        }
        await tx`
          UPDATE request_roles SET specialty_id=${role.specialtyId}::uuid,count_required=${role.count},schedule_json=${sql.json(role.schedule)},
            requirements_json=${sql.json(role.requirements)},target_client_rate=${role.targetClientRate}
          WHERE id=${role.id}::uuid AND request_id=${requestId}::uuid
        `;
      } else {
        await tx`
          INSERT INTO request_roles(organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json,target_client_rate)
          VALUES (${actor.organizationId}::uuid,${requestId}::uuid,${role.specialtyId}::uuid,${role.count},${sql.json(role.schedule)},${sql.json(role.requirements)},${role.targetClientRate})
        `;
      }
    }
    for (const oldRole of current.roles) {
      if (suppliedIds.has(oldRole.id)) continue;
      if (linkedIds.some((item) => item.id === oldRole.id)) throw new Error("Нельзя удалить позицию, по которой уже создан расчёт");
      await tx`DELETE FROM request_roles WHERE id=${oldRole.id}::uuid AND request_id=${requestId}::uuid`;
    }

    await tx`UPDATE request_public_submissions SET status='accepted',reviewed_by_user_id=${actor.userId}::uuid,reviewed_at=now(),review_comment=${comment} WHERE id=${submissionId}::uuid`;
    return { status: "accepted" };
  }));
}

export function calculateRequestCompleteness(request: Pick<CommercialRequestDetail,"title"|"location"|"regionId"|"startDate"|"durationText"|"schedule"|"roles">, intake: RequestIntake) {
  const checks = [
    { ok: Boolean(request.title.trim()), label: "название заявки" },
    { ok: Boolean(request.location.trim() || intake.object.city || request.regionId), label: "локация / регион" },
    { ok: Boolean(intake.contact.name && (intake.contact.phone || intake.contact.email || intake.contact.messenger)), label: "контакт заказчика" },
    { ok: Boolean(request.startDate || request.durationText), label: "сроки / дата старта" },
    { ok: request.roles.length > 0, label: "хотя бы одна позиция" },
    { ok: Boolean(intake.schedule.pattern || object(request.schedule).pattern), label: "график работы" },
    { ok: Boolean(intake.schedule.paidHours), label: "оплачиваемые часы" },
    { ok: intake.provision.housing.provider !== "unknown" || intake.provision.travel.provider !== "unknown", label: "логистика / проживание" },
    { ok: intake.compliance.workerCategories.length > 0, label: "допустимые категории работников" },
    { ok: intake.commercial.billingUnit !== "unknown", label: "модель оплаты заказчиком" },
  ];
  const completed = checks.filter((item) => item.ok).length;
  return { percent: Math.round((completed / checks.length) * 100), missing: checks.filter((item) => !item.ok).map((item) => item.label), ready: completed >= 8 && request.roles.length > 0 };
}
