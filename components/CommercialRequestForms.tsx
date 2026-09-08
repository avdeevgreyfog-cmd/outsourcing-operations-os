"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommercialOptions, CommercialRequestDetail } from "@/lib/commercial/service";
import {
  emptyRequestIntake,
  provisionKeys,
  type ProvisionKey,
  type RequestIntake,
} from "@/lib/commercial/request-intake";

type RoleDraft = {
  id?: string;
  specialtyId: string;
  count: number;
  schedule: Record<string, unknown>;
  requirements: Record<string, unknown>;
  targetClientRate: number | null;
  scheduleOverride: boolean;
};

type BaseDraft = {
  clientId: string;
  title: string;
  source: string;
  location: string;
  regionId: string;
  startDate: string;
  durationText: string;
  vatMode: string;
  comments: string;
};

const sectionMeta = [
  ["general", "Основное"],
  ["volume", "Объём и сроки"],
  ["schedule", "График"],
  ["roles", "Позиции"],
  ["provision", "Обеспечение"],
  ["compliance", "Требования"],
  ["commercial", "Коммерция"],
] as const;

const provisionLabels: Record<ProvisionKey, string> = {
  housing: "Проживание",
  travel: "Проезд до города / региона",
  shuttle: "Развозка до объекта",
  meals: "Питание",
  workwear: "Спецодежда",
  ppe: "СИЗ",
  tools: "Инструмент",
  consumables: "Расходные материалы",
  medical: "Медосмотр",
  medbook: "Медицинская книжка",
  training: "Обучение / допуски",
};

const providerOptions = [
  ["client", "Заказчик"],
  ["us", "Мы"],
  ["worker", "Работник"],
  ["not_required", "Не требуется"],
  ["unknown", "Уточнить"],
] as const;

const workerCategoryOptions = [
  ["rf", "Граждане РФ"],
  ["eaeu", "ЕАЭС"],
  ["foreign_with_docs", "Иностранные граждане с разрешительными документами"],
  ["client_rules", "По отдельным требованиям заказчика"],
] as const;

const documentCheckOptions = [
  ["security", "Служба безопасности"],
  ["medical", "Медосмотр"],
  ["medbook", "Медкнижка"],
  ["labor_safety", "Охрана труда"],
  ["industrial_safety", "Промышленная безопасность"],
  ["certificates", "Удостоверения / корочки"],
  ["pass_docs", "Документы для проходной"],
] as const;

function asText(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function asBoolean(value: unknown) { return value === true; }
function updateObject<T extends object>(value: T, patch: Partial<T>) { return { ...value, ...patch }; }

function roleFromRequest(role: CommercialRequestDetail["roles"][number]): RoleDraft {
  return {
    id: role.id,
    specialtyId: role.specialtyId,
    count: role.count,
    schedule: role.schedule ?? {},
    requirements: role.requirements ?? {},
    targetClientRate: role.targetClientRate === null ? null : Number(role.targetClientRate),
    scheduleOverride: Object.keys(role.schedule ?? {}).length > 0,
  };
}

function defaultRole(options: CommercialOptions): RoleDraft {
  return {
    specialtyId: options.specialties[0]?.id ?? "",
    count: 1,
    schedule: {},
    requirements: {},
    targetClientRate: null,
    scheduleOverride: false,
  };
}

function baseFromRequest(request?: CommercialRequestDetail): BaseDraft {
  return {
    clientId: request?.clientId ?? "",
    title: request?.title ?? "",
    source: request?.source ?? "manual",
    location: request?.location ?? "",
    regionId: request?.regionId ?? "",
    startDate: request?.startDate ?? "",
    durationText: request?.durationText ?? "",
    vatMode: request?.vatMode ?? "with_vat",
    comments: request?.comments ?? "",
  };
}

function provisionRule(intake: RequestIntake, key: ProvisionKey) {
  const item = intake.provision[key];
  const provider = providerOptions.find(([code]) => code === item.provider)?.[1] ?? "Уточнить";
  const cost = item.cost !== null ? ` · ${item.cost}${item.unit ? ` ${item.unit}` : ""}` : "";
  return `${provider}${cost}${item.comment ? ` · ${item.comment}` : ""}`;
}

function payloadFromState(base: BaseDraft, intake: RequestIntake, roles: RoleDraft[]) {
  const resolvedPattern = intake.schedule.pattern === "custom" ? intake.schedule.customPattern : intake.schedule.pattern;
  const schedule = {
    pattern: resolvedPattern,
    presenceHours: intake.schedule.presenceHours ?? 0,
    paidHours: intake.schedule.paidHours ?? 0,
    shiftStart: intake.schedule.shiftStart,
    shiftEnd: intake.schedule.shiftEnd,
    lunchMinutes: intake.schedule.lunchMinutes ?? 0,
    shiftType: intake.schedule.shiftType,
    rotationDays: intake.schedule.rotationDays,
  };
  return {
    clientId: base.clientId || null,
    title: base.title.trim(),
    source: base.source,
    location: base.location.trim(),
    regionId: base.regionId || null,
    startDate: base.startDate || undefined,
    durationText: base.durationText || undefined,
    schedule,
    intake,
    lunchPaid: intake.schedule.lunchPaid,
    vatMode: base.vatMode,
    housingRule: provisionRule(intake, "housing"),
    travelRule: provisionRule(intake, "travel"),
    shuttleRule: provisionRule(intake, "shuttle"),
    ppeRule: `${provisionRule(intake, "workwear")} / ${provisionRule(intake, "ppe")}`,
    medicalRule: `${provisionRule(intake, "medical")} / ${provisionRule(intake, "medbook")}`,
    citizenshipRule: intake.compliance.workerCategories.join(", "),
    toolsRule: provisionRule(intake, "tools"),
    comments: base.comments || undefined,
    roles: roles
      .filter((role) => role.specialtyId)
      .map((role) => ({
        id: role.id,
        specialtyId: role.specialtyId,
        count: Number(role.count),
        schedule: role.scheduleOverride ? role.schedule : {},
        requirements: role.requirements,
        targetClientRate: role.targetClientRate ?? intake.commercial.clientLimit,
      })),
  };
}

function liveCompleteness(base: BaseDraft, intake: RequestIntake, roles: RoleDraft[]) {
  const checks = [
    Boolean(base.title.trim()),
    Boolean(base.location.trim() || intake.object.city || base.regionId),
    Boolean(intake.contact.name && (intake.contact.phone || intake.contact.email || intake.contact.messenger)),
    Boolean(base.startDate || base.durationText),
    roles.some((role) => Boolean(role.specialtyId && role.count > 0)),
    Boolean(intake.schedule.pattern),
    Boolean(intake.schedule.paidHours),
    intake.provision.housing.provider !== "unknown" || intake.provision.travel.provider !== "unknown",
    intake.compliance.workerCategories.length > 0,
    intake.commercial.billingUnit !== "unknown",
  ];
  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}

function SectionComment({ section, intake, setIntake }: { section: string; intake: RequestIntake; setIntake: (next: RequestIntake) => void }) {
  const current = intake.sectionComments[section] ?? "";
  const [open, setOpen] = useState(Boolean(current));
  if (!open) return <div className="request-comment-box"><button type="button" className="request-subtle-action" onClick={() => setOpen(true)}>+ Добавить комментарий к разделу</button></div>;
  return <div className="request-comment-box"><textarea value={current} placeholder="Дополнительная информация по этому разделу" onChange={(event) => setIntake({ ...intake, sectionComments: { ...intake.sectionComments, [section]: event.target.value } })} /></div>;
}

function RoleCard({ role, index, options, roles, setRoles, globalSchedule }: {
  role: RoleDraft;
  index: number;
  options: CommercialOptions;
  roles: RoleDraft[];
  setRoles: (roles: RoleDraft[]) => void;
  globalSchedule: RequestIntake["schedule"];
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const specialty = options.specialties.find((item) => item.id === role.specialtyId)?.name ?? "Позиция";
  const requirements = role.requirements;
  const schedule = role.schedule;
  const patch = (next: Partial<RoleDraft>) => setRoles(roles.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item));
  const patchReq = (key: string, value: unknown) => patch({ requirements: { ...requirements, [key]: value } });
  const patchSchedule = (key: string, value: unknown) => patch({ schedule: { ...schedule, [key]: value } });

  return <article className="request-role-card">
    <div className="request-role-summary">
      <div>
        <strong>{specialty}</strong>
        <div className="request-role-meta"><span className="request-badge">{role.scheduleOverride ? "Свой график" : "Общий график"}</span>{role.targetClientRate !== null && <span className="request-badge">Лимит {role.targetClientRate} ₽</span>}</div>
      </div>
      <input aria-label="Численность" type="number" min="1" max="5000" value={role.count} onChange={(event) => patch({ count: Number(event.target.value) })} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Свернуть" : "Детали"}</button>
        <button type="button" className="icon-button" aria-label="Удалить позицию" onClick={() => setRoles(roles.filter((_, itemIndex) => itemIndex !== index))}>×</button>
      </div>
    </div>
    {expanded && <div className="request-role-details">
      <div className="request-form-grid">
        <div className="request-field span-2"><span>Специальность</span><select value={role.specialtyId} onChange={(event) => patch({ specialtyId: event.target.value })}>{options.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="request-field"><span>Разряд / квалификация</span><input value={asText(requirements.grade)} onChange={(event) => patchReq("grade", event.target.value)} placeholder="Например, 4–6 разряд" /></div>
        <div className="request-field"><span>Опыт</span><input value={asText(requirements.experience)} onChange={(event) => patchReq("experience", event.target.value)} placeholder="Не обязателен / от 1 года" /></div>
        <div className="request-field span-all"><span>Что будет делать сотрудник</span><textarea rows={2} value={asText(requirements.description)} onChange={(event) => patchReq("description", event.target.value)} placeholder="Коротко: задачи и характер работ" /></div>
        <div className="request-field span-2"><span>Удостоверения / допуски / корочки</span><input value={asText(requirements.certificates)} onChange={(event) => patchReq("certificates", event.target.value)} placeholder="Например, НАКС, группа по электробезопасности" /></div>
        <div className="request-field span-2"><span>Навыки / дополнительные требования</span><input value={asText(requirements.skills)} onChange={(event) => patchReq("skills", event.target.value)} /></div>
        <div className="request-field"><span>Ориентир ставки заказчика, ₽</span><input type="number" min="0" value={role.targetClientRate ?? ""} onChange={(event) => patch({ targetClientRate: event.target.value ? Number(event.target.value) : null })} /></div>
      </div>
      <label className="request-role-override"><input type="checkbox" checked={role.scheduleOverride} onChange={(event) => patch({ scheduleOverride: event.target.checked, schedule: event.target.checked ? { pattern: globalSchedule.pattern, presenceHours: globalSchedule.presenceHours, paidHours: globalSchedule.paidHours } : {} })} /> У этой позиции график отличается от общего</label>
      {role.scheduleOverride && <div className="request-three-col">
        <div className="request-field"><span>График</span><input value={asText(schedule.pattern)} onChange={(event) => patchSchedule("pattern", event.target.value)} placeholder="6/1, 2/2, вахта..." /></div>
        <div className="request-field"><span>Часов присутствия</span><input type="number" min="0" max="24" value={asNumber(schedule.presenceHours) ?? ""} onChange={(event) => patchSchedule("presenceHours", event.target.value ? Number(event.target.value) : null)} /></div>
        <div className="request-field"><span>Оплачиваемых часов</span><input type="number" min="0" max="24" value={asNumber(schedule.paidHours) ?? ""} onChange={(event) => patchSchedule("paidHours", event.target.value ? Number(event.target.value) : null)} /></div>
      </div>}
      <div className="request-field span-all" style={{ marginTop: 10 }}><span>Комментарий по позиции</span><textarea rows={2} value={asText(requirements.comment)} onChange={(event) => patchReq("comment", event.target.value)} /></div>
    </div>}
  </article>;
}

function RequestEditor({ options, request, initialIntake, canArchive = false }: {
  options: CommercialOptions;
  request?: CommercialRequestDetail;
  initialIntake?: RequestIntake;
  canArchive?: boolean;
}) {
  const router = useRouter();
  const [base, setBase] = useState<BaseDraft>(() => baseFromRequest(request));
  const [intake, setIntake] = useState<RequestIntake>(() => initialIntake ?? emptyRequestIntake());
  const [roles, setRoles] = useState<RoleDraft[]>(() => request ? request.roles.map(roleFromRequest) : [defaultRole(options)]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const completeness = useMemo(() => liveCompleteness(base, intake, roles), [base, intake, roles]);
  const locked = request ? request.archivedAt != null || ["accepted", "launched"].includes(request.status) : false;

  function patchBase(patch: Partial<BaseDraft>) { setBase((current) => ({ ...current, ...patch })); }
  function patchIntake<K extends keyof RequestIntake>(key: K, value: RequestIntake[K]) { setIntake((current) => ({ ...current, [key]: value })); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    setSaving(true); setError("");
    try {
      const payload = payloadFromState(base, intake, roles);
      const url = request ? `/api/requests/${request.id}` : "/api/requests";
      const response = await fetch(url, { method: request ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request ? { action: "update", ...payload } : payload) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить заявку");
      const id = request?.id ?? json.id;
      router.push(`/requests/${id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить заявку");
    } finally { setSaving(false); }
  }

  async function archive(action: "archive" | "restore") {
    if (!request) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/requests/${request.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось изменить состояние заявки");
      router.push(`/requests/${request.id}`); router.refresh();
    } catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : "Не удалось изменить состояние заявки"); }
    finally { setSaving(false); }
  }

  if (locked) return <div className="request-warning">Эта заявка зафиксирована: {request?.archivedAt ? "она находится в архиве" : "клиент уже принял коммерческие условия"}. Редактирование коммерческих исходных данных отключено.</div>;

  return <form onSubmit={submit}>
    <div className="request-section-nav-mobile">{sectionMeta.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div>
    <div className="request-editor-shell">
      <main className="request-editor-main">
        <section className="request-panel" id="general">
          <header className="request-panel-head"><div><h2>1. Основная информация</h2><p>Кто заказчик, где находится объект и с кем мы общаемся. Поля можно дополнять по ходу разговора.</p></div></header>
          <div className="request-panel-body">
            <div className="request-form-grid">
              <div className="request-field span-2"><span>Название заявки *</span><input required minLength={3} value={base.title} onChange={(event) => patchBase({ title: event.target.value })} placeholder="Например: Руднево · комплектовщики" /></div>
              <div className="request-field"><span>Клиент в системе</span><select value={base.clientId} onChange={(event) => patchBase({ clientId: event.target.value })}><option value="">Без привязанного клиента</option>{options.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div className="request-field"><span>Компания, как назвал заказчик</span><input value={intake.companyName} onChange={(event) => patchIntake("companyName", event.target.value)} placeholder="Можно заполнить без создания клиента" /></div>
              <div className="request-field"><span>Объект / площадка</span><input value={intake.object.siteName} onChange={(event) => patchIntake("object", updateObject(intake.object, { siteName: event.target.value }))} /></div>
              <div className="request-field span-2"><span>Адрес / локация</span><input value={base.location} onChange={(event) => patchBase({ location: event.target.value })} placeholder="Адрес, промпарк, ориентир" /></div>
              <div className="request-field"><span>Регион</span><select value={base.regionId} onChange={(event) => patchBase({ regionId: event.target.value })}><option value="">Пока не указан</option>{options.regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div className="request-field"><span>Город</span><input value={intake.object.city} onChange={(event) => patchIntake("object", updateObject(intake.object, { city: event.target.value }))} /></div>
              <div className="request-field"><span>Метро / ориентир</span><input value={intake.object.landmark} onChange={(event) => patchIntake("object", updateObject(intake.object, { landmark: event.target.value }))} /></div>
              <div className="request-field"><span>Тип объекта</span><select value={intake.object.objectType} onChange={(event) => patchIntake("object", updateObject(intake.object, { objectType: event.target.value }))}><option value="">Не указан</option><option value="warehouse">Склад</option><option value="production">Производство</option><option value="construction">Стройка</option><option value="office">Офис / контакт-центр</option><option value="retail">Ритейл</option><option value="other">Другое</option></select></div>
              <div className="request-field"><span>Контактное лицо</span><input value={intake.contact.name} onChange={(event) => patchIntake("contact", updateObject(intake.contact, { name: event.target.value }))} placeholder="Имя или ФИО" /></div>
              <div className="request-field"><span>Телефон</span><input type="tel" value={intake.contact.phone} onChange={(event) => patchIntake("contact", updateObject(intake.contact, { phone: event.target.value }))} /></div>
              <div className="request-field"><span>Email</span><input type="email" value={intake.contact.email} onChange={(event) => patchIntake("contact", updateObject(intake.contact, { email: event.target.value }))} /></div>
              <div className="request-field"><span>Мессенджер</span><select value={intake.contact.messengerType} onChange={(event) => patchIntake("contact", updateObject(intake.contact, { messengerType: event.target.value }))}><option value="">Не указан</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="other">Другой</option></select></div>
              <div className="request-field span-2"><span>Контакт / ссылка в мессенджере</span><input value={intake.contact.messenger} onChange={(event) => patchIntake("contact", updateObject(intake.contact, { messenger: event.target.value }))} /></div>
              <div className="request-field"><span>Источник</span><select value={base.source} onChange={(event) => patchBase({ source: event.target.value })}><option value="manual">Вручную / звонок</option><option value="lead">Из лида</option><option value="public_form">Внешняя форма</option><option value="tender">Тендер</option><option value="referral">Рекомендация</option><option value="calculation">Из самостоятельного расчёта</option></select></div>
            </div>
            <SectionComment section="general" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="volume">
          <header className="request-panel-head"><div><h2>2. Объём и сроки</h2><p>Отделяем реальную постоянную потребность от «до N человек по заявке» — это напрямую влияет на экономику.</p></div></header>
          <div className="request-panel-body">
            <div className="request-form-grid">
              <div className="request-field"><span>Плановый старт</span><input type="date" value={base.startDate} onChange={(event) => patchBase({ startDate: event.target.value })} /></div>
              <div className="request-field span-2"><span>Срок проекта</span><input list="request-duration-options" value={base.durationText} onChange={(event) => patchBase({ durationText: event.target.value })} placeholder="Например: более 12 месяцев" /><datalist id="request-duration-options"><option value="До 1 месяца"/><option value="1–3 месяца"/><option value="3–6 месяцев"/><option value="6–12 месяцев"/><option value="Более 12 месяцев"/><option value="Бессрочно"/></datalist></div>
              <div className="request-field"><span>Вывод людей</span><select value={intake.volume.launchMode} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { launchMode: event.target.value }))}><option value="once">Одновременно</option><option value="phased">Поэтапно</option><option value="on_demand">По заявке заказчика</option></select></div>
              <div className="request-field"><span>Людей на первый выход</span><input type="number" min="0" value={intake.volume.startHeadcount ?? ""} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { startHeadcount: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field"><span>Характер потребности</span><select value={intake.volume.demandType} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { demandType: event.target.value }))}><option value="fixed">Фиксированная численность</option><option value="variable">Плавающая</option><option value="on_demand">Только по заявке</option><option value="unknown">Уточнить</option></select></div>
              <div className="request-field"><span>Гарантированные часы / мес.</span><input type="number" min="0" value={intake.volume.guaranteedHours ?? ""} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { guaranteedHours: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field"><span>Гарантированные смены / мес.</span><input type="number" min="0" value={intake.volume.guaranteedShifts ?? ""} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { guaranteedShifts: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field span-all"><span>Как будет меняться объём / волны вывода</span><textarea rows={2} value={intake.volume.comment} onChange={(event) => patchIntake("volume", updateObject(intake.volume, { comment: event.target.value }))} /></div>
            </div>
            <SectionComment section="volume" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="schedule">
          <header className="request-panel-head"><div><h2>3. Общий график</h2><p>Это график по умолчанию для всех позиций. Если у конкретной специальности условия отличаются, их можно переопределить внутри позиции.</p></div></header>
          <div className="request-panel-body">
            <div className="request-form-grid">
              <div className="request-field"><span>График</span><select value={intake.schedule.pattern} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { pattern: event.target.value }))}><option value="">Не указан</option><option value="5/2">5/2</option><option value="6/1">6/1</option><option value="7/0">7/0</option><option value="2/2">2/2</option><option value="3/3">3/3</option><option value="rotation">Вахта</option><option value="flexible">Гибкий / по заявке</option><option value="custom">Другой</option></select></div>
              {intake.schedule.pattern === "custom" && <div className="request-field"><span>Свой график</span><input value={intake.schedule.customPattern} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { customPattern: event.target.value }))} /></div>}
              <div className="request-field"><span>Тип смен</span><select value={intake.schedule.shiftType} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { shiftType: event.target.value }))}><option value="day">Дневные</option><option value="night">Ночные</option><option value="both">День / ночь</option><option value="flexible">Плавающие</option></select></div>
              <div className="request-field"><span>Начало смены</span><input type="time" value={intake.schedule.shiftStart} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { shiftStart: event.target.value }))} /></div>
              <div className="request-field"><span>Конец смены</span><input type="time" value={intake.schedule.shiftEnd} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { shiftEnd: event.target.value }))} /></div>
              <div className="request-field"><span>Часов присутствия</span><input type="number" min="0" max="24" step="0.5" value={intake.schedule.presenceHours ?? ""} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { presenceHours: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field"><span>Оплачиваемых часов</span><input type="number" min="0" max="24" step="0.5" value={intake.schedule.paidHours ?? ""} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { paidHours: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field"><span>Обед, минут</span><input type="number" min="0" max="240" value={intake.schedule.lunchMinutes ?? ""} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { lunchMinutes: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="request-field"><span>Оплата обеда</span><select value={intake.schedule.lunchPaid ? "paid" : "unpaid"} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { lunchPaid: event.target.value === "paid" }))}><option value="unpaid">Не оплачивается</option><option value="paid">Оплачивается</option></select></div>
              {intake.schedule.pattern === "rotation" && <div className="request-field"><span>Длительность вахты, дней</span><input type="number" min="1" value={intake.schedule.rotationDays ?? ""} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { rotationDays: event.target.value ? Number(event.target.value) : null }))} /></div>}
              <div className="request-field span-all"><span>Переработки, праздники, особые условия</span><textarea rows={2} value={intake.schedule.overtimeNotes} onChange={(event) => patchIntake("schedule", updateObject(intake.schedule, { overtimeNotes: event.target.value }))} /></div>
            </div>
            <SectionComment section="schedule" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="roles">
          <header className="request-panel-head"><div><h2>4. Позиции</h2><p>Добавляйте только специальность и численность, если деталей пока нет. Дополнительные требования и свой график раскрываются по необходимости.</p></div><button type="button" className="button" onClick={() => setRoles([...roles, defaultRole(options)])}>+ Позиция</button></header>
          <div className="request-panel-body">
            <div className="request-role-list">{roles.length ? roles.map((role, index) => <RoleCard key={role.id ?? `new-${index}`} role={role} index={index} options={options} roles={roles} setRoles={setRoles} globalSchedule={intake.schedule} />) : <div className="request-inline-note">Позиции пока не добавлены. Черновик можно сохранить и дополнить позже.</div>}</div>
            <SectionComment section="roles" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="provision">
          <header className="request-panel-head"><div><h2>5. Обеспечение и логистика</h2><p>Выберите, кто обеспечивает каждую статью. Если расход несём мы, можно сразу указать ориентир стоимости — он сохранится для расчёта.</p></div></header>
          <div className="request-panel-body">
            <div style={{ overflowX: "auto" }}><table className="request-provision"><thead><tr><th>Условие</th><th>Кто обеспечивает</th><th>Стоимость</th><th>Единица</th><th>Комментарий</th></tr></thead><tbody>{provisionKeys.map((key) => {
              const item = intake.provision[key];
              return <tr key={key}><td><strong>{provisionLabels[key]}</strong></td><td><select value={item.provider} onChange={(event) => setIntake({ ...intake, provision: { ...intake.provision, [key]: { ...item, provider: event.target.value } } })}>{providerOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></td><td><input type="number" min="0" value={item.cost ?? ""} disabled={item.provider !== "us"} onChange={(event) => setIntake({ ...intake, provision: { ...intake.provision, [key]: { ...item, cost: event.target.value ? Number(event.target.value) : null } } })} /></td><td><input value={item.unit} disabled={item.provider !== "us"} placeholder="₽/сутки" onChange={(event) => setIntake({ ...intake, provision: { ...intake.provision, [key]: { ...item, unit: event.target.value } } })} /></td><td><input value={item.comment} onChange={(event) => setIntake({ ...intake, provision: { ...intake.provision, [key]: { ...item, comment: event.target.value } } })} /></td></tr>;
            })}</tbody></table></div>
            <SectionComment section="provision" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="compliance">
          <header className="request-panel-head"><div><h2>6. Требования и допуск на объект</h2><p>Фиксируем только те ограничения, которые реально озвучил заказчик. Неизвестное не превращаем автоматически в обязательное требование.</p></div></header>
          <div className="request-panel-body">
            <div className="request-form-grid">
              <div className="request-field"><span>Проверка СБ</span><select value={intake.compliance.securityCheck} onChange={(event) => patchIntake("compliance", updateObject(intake.compliance, { securityCheck: event.target.value }))}><option value="unknown">Уточнить</option><option value="required">Требуется</option><option value="not_required">Не требуется</option></select></div>
              <div className="request-field span-all"><span>Допустимые категории работников</span><div className="request-check-grid">{workerCategoryOptions.map(([code, label]) => <label className="request-check-item" key={code}><input type="checkbox" checked={intake.compliance.workerCategories.includes(code)} onChange={(event) => patchIntake("compliance", updateObject(intake.compliance, { workerCategories: event.target.checked ? [...intake.compliance.workerCategories, code] : intake.compliance.workerCategories.filter((item) => item !== code) }))} />{label}</label>)}</div></div>
              <div className="request-field span-all"><span>Документы / проверки / обучение</span><div className="request-check-grid">{documentCheckOptions.map(([code, label]) => <label className="request-check-item" key={code}><input type="checkbox" checked={intake.compliance.documentChecks.includes(code)} onChange={(event) => patchIntake("compliance", updateObject(intake.compliance, { documentChecks: event.target.checked ? [...intake.compliance.documentChecks, code] : intake.compliance.documentChecks.filter((item) => item !== code) }))} />{label}</label>)}</div></div>
              <div className="request-field span-all"><span>Дополнительные требования по допуску</span><textarea rows={2} value={intake.compliance.comment} onChange={(event) => patchIntake("compliance", updateObject(intake.compliance, { comment: event.target.value }))} /></div>
            </div>
            <SectionComment section="compliance" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel" id="commercial">
          <header className="request-panel-head"><div><h2>7. Коммерческие ориентиры</h2><p>Необязательный раздел. Сюда попадает всё, что заказчик уже назвал по бюджету, зарплате или конкурентным предложениям.</p></div></header>
          <div className="request-panel-body">
            <div className="request-form-grid">
              <div className="request-field"><span>Как оплачивает заказчик</span><select value={intake.commercial.billingUnit} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { billingUnit: event.target.value }))}><option value="unknown">Пока неизвестно</option><option value="hour">Человеко-час</option><option value="shift">Смена</option><option value="worker_month">Сотрудник / месяц</option><option value="unit">Единица</option><option value="volume">Объём / сдельно</option><option value="fixed">Фикс за проект</option><option value="mixed">Смешанная модель</option></select></div>
              <div className="request-field"><span>Бюджет озвучен</span><div className="request-number-with-unit"><input type="number" min="0" value={intake.commercial.clientLimit ?? ""} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { clientLimit: event.target.value ? Number(event.target.value) : null }))} placeholder="₽" /><select value={intake.commercial.clientLimitVatMode} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { clientLimitVatMode: event.target.value }))}><option value="with_vat">с НДС</option><option value="without_vat">без НДС</option></select></div></div>
              <div className="request-field"><span>Желаемая зарплата сотруднику</span><div className="request-number-with-unit"><input type="number" min="0" value={intake.commercial.desiredWorkerNet ?? ""} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { desiredWorkerNet: event.target.value ? Number(event.target.value) : null }))} /><select value={intake.commercial.desiredWorkerNetUnit} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { desiredWorkerNetUnit: event.target.value }))}><option value="hour">₽/час</option><option value="shift">₽/смена</option><option value="month">₽/месяц</option></select></div></div>
              <div className="request-field"><span>Ставка конкурента</span><div className="request-number-with-unit"><input type="number" min="0" value={intake.commercial.competitorRate ?? ""} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { competitorRate: event.target.value ? Number(event.target.value) : null }))} /><select value={intake.commercial.competitorRateVatMode} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { competitorRateVatMode: event.target.value }))}><option value="with_vat">с НДС</option><option value="without_vat">без НДС</option></select></div></div>
              <div className="request-field span-2"><span>Комментарий по конкуренту</span><input value={intake.commercial.competitorComment} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { competitorComment: event.target.value }))} /></div>
              <div className="request-field"><span>В каком виде считаем НДС</span><select value={base.vatMode} onChange={(event) => patchBase({ vatMode: event.target.value })}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select></div>
              <div className="request-field span-all"><span>Условия оплаты / отсрочка</span><input value={intake.commercial.paymentTerms} onChange={(event) => patchIntake("commercial", updateObject(intake.commercial, { paymentTerms: event.target.value }))} placeholder="Например: 30 календарных дней" /></div>
            </div>
            <SectionComment section="commercial" intake={intake} setIntake={setIntake} />
          </div>
        </section>

        <section className="request-panel">
          <header className="request-panel-head"><div><h2>Общий комментарий</h2><p>Для информации, которая не подходит ни к одному из разделов выше.</p></div></header>
          <div className="request-panel-body"><div className="request-field span-all"><textarea rows={4} value={base.comments} onChange={(event) => patchBase({ comments: event.target.value })} placeholder="Любые важные нюансы заявки" /></div></div>
        </section>
        {error && <div className="form-error">{error}</div>}
      </main>

      <aside className="request-editor-aside">
        <div className="request-completeness"><strong><span>Полнота заявки</span><span>{completeness}%</span></strong><div className="request-progress"><span style={{ width: `${completeness}%` }} /></div><p>{completeness >= 80 ? "Основных данных достаточно для перехода к расчёту. Перед расчётом всё равно проверьте позиции и финансовые ориентиры." : "Черновик можно сохранить сейчас. Недостающие данные менеджер или заказчик сможет дополнить позже."}</p></div>
        <nav className="request-anchor-card">{sectionMeta.map(([id, label], index) => <a key={id} href={`#${id}`}><span>{index + 1}. {label}</span><small>→</small></a>)}</nav>
        <div className="request-sticky-actions"><button type="submit" className="button primary" disabled={saving}>{saving ? "Сохранение..." : request ? "Сохранить заявку" : "Создать черновик"}</button><Link className="button" href={request ? `/requests/${request.id}` : "/requests"}>Отмена</Link></div>
        {request && canArchive && <button type="button" className="button" disabled={saving} onClick={() => archive(request.archivedAt ? "restore" : "archive")}>{request.archivedAt ? "Восстановить" : "Архивировать"}</button>}
        <div className="request-inline-note">После сохранения заявку можно отправить заказчику по внешней ссылке. Его изменения попадут на проверку и не перезапишут ваши данные автоматически.</div>
      </aside>
    </div>
  </form>;
}

export function RequestCreateButton({ options }: { options: CommercialOptions }) {
  void options;
  return <Link className="button primary" href="/requests/new">+ Заявка</Link>;
}

export function RequestEditButton({ request, options, canArchive }: { request: CommercialRequestDetail; options: CommercialOptions; canArchive: boolean }) {
  void options; void canArchive;
  return <Link className="button" href={`/requests/${request.id}/edit`}>Редактировать</Link>;
}

export function RequestCreateWorkspace({ options }: { options: CommercialOptions }) {
  return <RequestEditor options={options} />;
}

export function RequestEditWorkspace({ request, options, intake, canArchive }: { request: CommercialRequestDetail; options: CommercialOptions; intake: RequestIntake; canArchive: boolean }) {
  return <RequestEditor options={options} request={request} initialIntake={intake} canArchive={canArchive} />;
}
