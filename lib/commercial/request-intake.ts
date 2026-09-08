export const provisionKeys = ["housing","travel","shuttle","meals","workwear","ppe","tools","consumables","medical","medbook","training"] as const;
export type ProvisionKey = typeof provisionKeys[number];
export type ProvisionItem = { provider: string; cost: number | null; unit: string; comment: string };
export type MessengerItem = { type: string; value: string };
export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type RequestIntake = {
  companyName: string;
  object: {
    siteName: string;
    city: string;
    landmark: string;
    objectType: string;
    accessType: string;
    accessComment: string;
  };
  contact: {
    name: string;
    phone: string;
    email: string;
    messengerType: string;
    messenger: string;
    messengers: MessengerItem[];
  };
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
  logistics: {
    housingScope: string;
    brigadierProvider: string;
  };
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
  schedule: JsonObject;
  requirements: JsonObject;
  targetClientRate: number | null;
};

export type PublicRequestSubmissionPayload = {
  title: string;
  location: string | null;
  regionId: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: JsonObject;
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
  object: { siteName: "", city: "", landmark: "", objectType: "", accessType: "unknown", accessComment: "" },
  contact: { name: "", phone: "", email: "", messengerType: "", messenger: "", messengers: [] },
  volume: { launchMode: "once", startHeadcount: null, demandType: "fixed", guaranteedHours: null, guaranteedShifts: null, comment: "" },
  schedule: { pattern: "", customPattern: "", shiftStart: "", shiftEnd: "", presenceHours: null, paidHours: null, lunchMinutes: 60, lunchPaid: false, shiftType: "day", rotationDays: null, overtimeNotes: "" },
  provision: emptyProvision(),
  logistics: { housingScope: "as_needed", brigadierProvider: "not_required" },
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
function messengers(value: unknown): MessengerItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = object(item);
    const type = text(row.type);
    const messengerValue = text(row.value);
    return type || messengerValue ? [{ type, value: messengerValue }] : [];
  });
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function normalizeRequestIntake(value: unknown): RequestIntake {
  const base = emptyRequestIntake();
  const root = object(value);
  const objectData = object(root.object);
  const contact = object(root.contact);
  const volume = object(root.volume);
  const schedule = object(root.schedule);
  const provision = object(root.provision);
  const logistics = object(root.logistics);
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

  const normalizedMessengers = messengers(contact.messengers);
  const legacyType = text(contact.messengerType);
  const legacyValue = text(contact.messenger);
  if (normalizedMessengers.length === 0 && (legacyType || legacyValue)) normalizedMessengers.push({ type: legacyType, value: legacyValue });

  return {
    companyName: text(root.companyName),
    object: {
      siteName: text(objectData.siteName),
      city: text(objectData.city),
      landmark: text(objectData.landmark),
      objectType: text(objectData.objectType),
      accessType: text(objectData.accessType, base.object.accessType),
      accessComment: text(objectData.accessComment),
    },
    contact: {
      name: text(contact.name), phone: text(contact.phone), email: text(contact.email),
      messengerType: legacyType, messenger: legacyValue, messengers: normalizedMessengers,
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
    logistics: {
      housingScope: text(logistics.housingScope, base.logistics.housingScope),
      brigadierProvider: text(logistics.brigadierProvider, base.logistics.brigadierProvider),
    },
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

type RequestCompletenessSource = {
  title: string;
  location: string;
  regionId: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: Record<string, unknown>;
  roles: Array<unknown>;
};

export function calculateRequestCompleteness(request: RequestCompletenessSource, intake: RequestIntake) {
  const hasMessenger = intake.contact.messengers.some((item) => item.value.trim()) || Boolean(intake.contact.messenger);
  const checks = [
    { ok: Boolean(request.title.trim()), label: "название заявки" },
    { ok: Boolean(request.location.trim() || intake.object.city || request.regionId), label: "адрес / локация" },
    { ok: Boolean(intake.contact.name && (intake.contact.phone || intake.contact.email || hasMessenger)), label: "контакт заказчика" },
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
