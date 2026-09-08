"use client";

import { useState } from "react";
import {
  provisionKeys,
  type ProvisionKey,
  type PublicRequestContext,
  type RequestIntake,
} from "@/lib/commercial/request-intake";

type PublicRole = PublicRequestContext["roles"][number] & { scheduleOverride: boolean };

const provisionLabels: Record<ProvisionKey, string> = {
  housing: "Проживание", travel: "Проезд до региона", shuttle: "Развозка до объекта", meals: "Питание",
  workwear: "Спецодежда", ppe: "СИЗ", tools: "Инструмент", consumables: "Расходные материалы",
  medical: "Медосмотр", medbook: "Медицинская книжка", training: "Обучение / допуски",
};
const providerOptions = [["client","Заказчик"],["us","Исполнитель"],["worker","Работник"],["not_required","Не требуется"],["unknown","Нужно уточнить"]] as const;
const workerCategories = [["rf","Граждане РФ"],["eaeu","ЕАЭС"],["foreign_with_docs","Иностранные граждане с разрешительными документами"],["client_rules","Другие согласованные категории"]] as const;
const documentChecks = [["security","Проверка СБ"],["medical","Медосмотр"],["medbook","Медкнижка"],["labor_safety","Охрана труда"],["industrial_safety","Промышленная безопасность"],["certificates","Удостоверения / допуски"],["pass_docs","Документы для проходной"]] as const;

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function patch<T extends object>(value: T, next: Partial<T>) { return { ...value, ...next }; }
function rule(intake: RequestIntake, key: ProvisionKey) {
  const item = intake.provision[key];
  const label = providerOptions.find(([code]) => code === item.provider)?.[1] ?? "Нужно уточнить";
  return `${label}${item.cost !== null ? ` · ${item.cost}${item.unit ? ` ${item.unit}` : ""}` : ""}${item.comment ? ` · ${item.comment}` : ""}`;
}

export function PublicRequestForm({ token, context }: { token: string; context: PublicRequestContext }) {
  const [title, setTitle] = useState(context.title);
  const [location, setLocation] = useState(context.location);
  const [regionId, setRegionId] = useState(context.regionId ?? "");
  const [startDate, setStartDate] = useState(context.startDate ?? "");
  const [durationText, setDurationText] = useState(context.durationText ?? "");
  const [vatMode, setVatMode] = useState(context.vatMode ?? "with_vat");
  const [comments, setComments] = useState(context.comments ?? "");
  const [intake, setIntake] = useState<RequestIntake>(context.intake);
  const [roles, setRoles] = useState<PublicRole[]>(context.roles.map((role) => ({ ...role, scheduleOverride: Object.keys(role.schedule ?? {}).length > 0 })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function changeProvision(key: ProvisionKey, next: Partial<RequestIntake["provision"][ProvisionKey]>) {
    setIntake((current) => ({ ...current, provision: { ...current.provision, [key]: { ...current.provision[key], ...next } } }));
  }
  function rolePatch(index: number, next: Partial<PublicRole>) { setRoles((current) => current.map((role, roleIndex) => roleIndex === index ? { ...role, ...next } : role)); }
  function reqPatch(index: number, key: string, value: unknown) { rolePatch(index, { requirements: { ...roles[index].requirements, [key]: value } }); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const resolvedPattern = intake.schedule.pattern === "custom" ? intake.schedule.customPattern : intake.schedule.pattern;
      const schedule = {
        pattern: resolvedPattern, presenceHours: intake.schedule.presenceHours ?? 0, paidHours: intake.schedule.paidHours ?? 0,
        shiftStart: intake.schedule.shiftStart, shiftEnd: intake.schedule.shiftEnd, lunchMinutes: intake.schedule.lunchMinutes ?? 0,
        shiftType: intake.schedule.shiftType, rotationDays: intake.schedule.rotationDays,
      };
      const payload = {
        title, location, regionId: regionId || null, startDate: startDate || null, durationText: durationText || null,
        schedule, lunchPaid: intake.schedule.lunchPaid, vatMode,
        housingRule: rule(intake, "housing"), travelRule: rule(intake, "travel"), shuttleRule: rule(intake, "shuttle"),
        ppeRule: `${rule(intake, "workwear")} / ${rule(intake, "ppe")}`,
        medicalRule: `${rule(intake, "medical")} / ${rule(intake, "medbook")}`,
        citizenshipRule: intake.compliance.workerCategories.join(", "), toolsRule: rule(intake, "tools"), comments: comments || null, intake,
        roles: roles.filter((role) => role.specialtyId).map((role) => ({
          id: role.id, specialtyId: role.specialtyId, count: role.count,
          schedule: role.scheduleOverride ? role.schedule : {}, requirements: role.requirements,
          targetClientRate: role.targetClientRate ?? intake.commercial.clientLimit,
        })),
      };
      const response = await fetch(`/api/public/requests/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось отправить заявку");
      setSent(true); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Не удалось отправить заявку"); }
    finally { setBusy(false); }
  }

  if (sent) return <section className="request-form-shell public-success"><span className="request-badge success">Отправлено</span><h2>Спасибо, данные переданы менеджеру</h2><p>Изменения сохранены отдельной версией и будут применены к рабочей заявке только после проверки.</p></section>;

  return <form className="request-form-shell public-request-form" onSubmit={submit}>
    {error && <div className="request-warning">{error}</div>}

    <section className="request-section"><div className="request-section-head"><span>01</span><div><h2>Компания и объект</h2><p>Кто заказывает персонал и где будет работа.</p></div></div><div className="request-grid cols-2">
      <label className="request-field span-2"><span>Название заявки</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
      <label className="request-field"><span>Компания</span><input value={intake.companyName} onChange={(event) => setIntake((current) => ({ ...current, companyName: event.target.value }))} /></label>
      <label className="request-field"><span>Объект / площадка</span><input value={intake.object.siteName} onChange={(event) => setIntake((current) => ({ ...current, object: patch(current.object, { siteName: event.target.value }) }))} /></label>
      <label className="request-field"><span>Адрес / локация</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
      <label className="request-field"><span>Регион</span><select value={regionId} onChange={(event) => setRegionId(event.target.value)}><option value="">Не выбран</option>{context.regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
      <label className="request-field"><span>Город</span><input value={intake.object.city} onChange={(event) => setIntake((current) => ({ ...current, object: patch(current.object, { city: event.target.value }) }))} /></label>
      <label className="request-field"><span>Ориентир / метро</span><input value={intake.object.landmark} onChange={(event) => setIntake((current) => ({ ...current, object: patch(current.object, { landmark: event.target.value }) }))} /></label>
    </div></section>

    <section className="request-section"><div className="request-section-head"><span>02</span><div><h2>Контакт</h2><p>Кого менеджер может быстро уточнить по условиям заявки.</p></div></div><div className="request-grid cols-2">
      <label className="request-field"><span>Имя</span><input value={intake.contact.name} onChange={(event) => setIntake((current) => ({ ...current, contact: patch(current.contact, { name: event.target.value }) }))} /></label>
      <label className="request-field"><span>Телефон</span><input value={intake.contact.phone} onChange={(event) => setIntake((current) => ({ ...current, contact: patch(current.contact, { phone: event.target.value }) }))} /></label>
      <label className="request-field"><span>Email</span><input type="email" value={intake.contact.email} onChange={(event) => setIntake((current) => ({ ...current, contact: patch(current.contact, { email: event.target.value }) }))} /></label>
      <label className="request-field"><span>Мессенджер</span><input value={intake.contact.messenger} onChange={(event) => setIntake((current) => ({ ...current, contact: patch(current.contact, { messenger: event.target.value }) }))} /></label>
    </div></section>

    <section className="request-section"><div className="request-section-head"><span>03</span><div><h2>Объём и график</h2><p>Когда старт, сколько людей и какой режим работы.</p></div></div><div className="request-grid cols-4">
      <label className="request-field"><span>Дата старта</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label className="request-field"><span>Срок проекта</span><input value={durationText} onChange={(event) => setDurationText(event.target.value)} placeholder="Например, 12+ месяцев" /></label>
      <label className="request-field"><span>График</span><select value={intake.schedule.pattern} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { pattern: event.target.value }) }))}><option value="">Уточнить</option><option value="5/2">5/2</option><option value="6/1">6/1</option><option value="2/2">2/2</option><option value="3/3">3/3</option><option value="7/0">7/0</option><option value="custom">Другой</option></select></label>
      <label className="request-field"><span>Тип смены</span><select value={intake.schedule.shiftType} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { shiftType: event.target.value }) }))}><option value="day">Дневная</option><option value="night">Ночная</option><option value="mixed">День / ночь</option></select></label>
      {intake.schedule.pattern === "custom" && <label className="request-field span-2"><span>Свой график</span><input value={intake.schedule.customPattern} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { customPattern: event.target.value }) }))} /></label>}
      <label className="request-field"><span>Начало смены</span><input type="time" value={intake.schedule.shiftStart} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { shiftStart: event.target.value }) }))} /></label>
      <label className="request-field"><span>Конец смены</span><input type="time" value={intake.schedule.shiftEnd} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { shiftEnd: event.target.value }) }))} /></label>
      <label className="request-field"><span>Часов присутствия</span><input type="number" min="0" step="0.5" value={intake.schedule.presenceHours ?? ""} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { presenceHours: event.target.value ? Number(event.target.value) : null }) }))} /></label>
      <label className="request-field"><span>Оплачиваемых часов</span><input type="number" min="0" step="0.5" value={intake.schedule.paidHours ?? ""} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { paidHours: event.target.value ? Number(event.target.value) : null }) }))} /></label>
      <label className="request-field checkbox-field"><input type="checkbox" checked={intake.schedule.lunchPaid} onChange={(event) => setIntake((current) => ({ ...current, schedule: patch(current.schedule, { lunchPaid: event.target.checked }) }))} /><span>Обед оплачивается</span></label>
    </div></section>

    <section className="request-section"><div className="request-section-head"><span>04</span><div><h2>Позиции</h2><p>Профессии, численность и требования. При необходимости добавьте новую позицию.</p></div></div><div className="request-role-list">
      {roles.map((role, index) => <article className="request-role-card" key={role.id || index}><div className="request-role-head"><strong>Позиция {index + 1}</strong>{roles.length > 1 && <button type="button" className="request-subtle-action" onClick={() => setRoles((current) => current.filter((_, roleIndex) => roleIndex !== index))}>Удалить</button>}</div><div className="request-grid cols-4">
        <label className="request-field span-2"><span>Специальность</span><select value={role.specialtyId} onChange={(event) => rolePatch(index, { specialtyId: event.target.value })}><option value="">Выберите</option>{context.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="request-field"><span>Количество</span><input type="number" min="1" value={role.count} onChange={(event) => rolePatch(index, { count: Math.max(1, Number(event.target.value) || 1) })} /></label>
        <label className="request-field"><span>Опыт</span><input value={text(role.requirements.experience)} onChange={(event) => reqPatch(index, "experience", event.target.value)} /></label>
        <label className="request-field span-2"><span>Что будет делать сотрудник</span><textarea rows={3} value={text(role.requirements.description)} onChange={(event) => reqPatch(index, "description", event.target.value)} /></label>
        <label className="request-field span-2"><span>Удостоверения / допуски</span><textarea rows={3} value={text(role.requirements.certificates)} onChange={(event) => reqPatch(index, "certificates", event.target.value)} /></label>
        <label className="request-field checkbox-field span-2"><input type="checkbox" checked={role.scheduleOverride} onChange={(event) => rolePatch(index, { scheduleOverride: event.target.checked })} /><span>У этой позиции свой график</span></label>
        {role.scheduleOverride && <label className="request-field span-2"><span>График позиции</span><input value={text(role.schedule.pattern)} onChange={(event) => rolePatch(index, { schedule: { ...role.schedule, pattern: event.target.value } })} /></label>}
      </div></article>)}
      <button type="button" className="button" onClick={() => setRoles((current) => [...current, { id: "", specialtyId: "", specialty: "", count: 1, schedule: {}, requirements: {}, targetClientRate: null, scheduleOverride: false }])}>Добавить позицию</button>
    </div></section>

    <section className="request-section"><div className="request-section-head"><span>05</span><div><h2>Обеспечение</h2><p>Укажите, кто отвечает за каждую статью. Если расходы несёт исполнитель, можно сразу указать стоимость.</p></div></div><div className="request-provision-table"><div className="request-provision-row request-provision-head"><span>Статья</span><span>Кто обеспечивает</span><span>Стоимость</span><span>Комментарий</span></div>{provisionKeys.map((key) => { const item = intake.provision[key]; return <div className="request-provision-row" key={key}><strong>{provisionLabels[key]}</strong><select value={item.provider} onChange={(event) => changeProvision(key, { provider: event.target.value })}>{providerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="request-money-pair"><input type="number" min="0" value={item.cost ?? ""} onChange={(event) => changeProvision(key, { cost: event.target.value ? Number(event.target.value) : null })} placeholder="0" /><input value={item.unit} onChange={(event) => changeProvision(key, { unit: event.target.value })} placeholder="₽/сутки" /></div><input value={item.comment} onChange={(event) => changeProvision(key, { comment: event.target.value })} placeholder="Условия / детали" /></div>; })}</div></section>

    <section className="request-section"><div className="request-section-head"><span>06</span><div><h2>Требования к людям</h2><p>Категории работников, документы и проверки.</p></div></div><div className="request-grid cols-2">
      <div className="request-field span-2"><span>Допустимые категории работников</span><div className="request-chip-grid">{workerCategories.map(([value, label]) => <label className="request-check-card" key={value}><input type="checkbox" checked={intake.compliance.workerCategories.includes(value)} onChange={(event) => setIntake((current) => ({ ...current, compliance: patch(current.compliance, { workerCategories: event.target.checked ? [...current.compliance.workerCategories, value] : current.compliance.workerCategories.filter((item) => item !== value) }) }))} /><span>{label}</span></label>)}</div></div>
      <label className="request-field"><span>Проверка СБ</span><select value={intake.compliance.securityCheck} onChange={(event) => setIntake((current) => ({ ...current, compliance: patch(current.compliance, { securityCheck: event.target.value }) }))}><option value="unknown">Уточнить</option><option value="required">Требуется</option><option value="not_required">Не требуется</option></select></label>
      <div className="request-field span-2"><span>Документы / проверки</span><div className="request-chip-grid">{documentChecks.map(([value, label]) => <label className="request-check-card" key={value}><input type="checkbox" checked={intake.compliance.documentChecks.includes(value)} onChange={(event) => setIntake((current) => ({ ...current, compliance: patch(current.compliance, { documentChecks: event.target.checked ? [...current.compliance.documentChecks, value] : current.compliance.documentChecks.filter((item) => item !== value) }) }))} /><span>{label}</span></label>)}</div></div>
    </div></section>

    <section className="request-section"><div className="request-section-head"><span>07</span><div><h2>Коммерческие ориентиры</h2><p>Этот раздел помогает менеджеру быстрее подготовить реалистичный расчёт.</p></div></div><div className="request-grid cols-4">
      <label className="request-field"><span>Единица оплаты</span><select value={intake.commercial.billingUnit} onChange={(event) => setIntake((current) => ({ ...current, commercial: patch(current.commercial, { billingUnit: event.target.value }) }))}><option value="unknown">Уточнить</option><option value="hour">Человеко-час</option><option value="shift">Смена</option><option value="worker_month">Сотрудник / месяц</option><option value="unit">Единица</option><option value="volume">Объём</option><option value="fixed">Фикс за проект</option><option value="mixed">Смешанная</option></select></label>
      <label className="request-field"><span>Лимит / бюджет заказчика</span><input type="number" min="0" value={intake.commercial.clientLimit ?? ""} onChange={(event) => setIntake((current) => ({ ...current, commercial: patch(current.commercial, { clientLimit: event.target.value ? Number(event.target.value) : null }) }))} /></label>
      <label className="request-field"><span>НДС</span><select value={vatMode} onChange={(event) => setVatMode(event.target.value)}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option></select></label>
      <label className="request-field"><span>Желаемая выплата сотруднику</span><input type="number" min="0" value={intake.commercial.desiredWorkerNet ?? ""} onChange={(event) => setIntake((current) => ({ ...current, commercial: patch(current.commercial, { desiredWorkerNet: event.target.value ? Number(event.target.value) : null }) }))} /></label>
      <label className="request-field"><span>Единица выплаты</span><select value={intake.commercial.desiredWorkerNetUnit} onChange={(event) => setIntake((current) => ({ ...current, commercial: patch(current.commercial, { desiredWorkerNetUnit: event.target.value }) }))}><option value="hour">Час</option><option value="shift">Смена</option><option value="month">Месяц</option></select></label>
      <label className="request-field span-2"><span>Условия оплаты</span><input value={intake.commercial.paymentTerms} onChange={(event) => setIntake((current) => ({ ...current, commercial: patch(current.commercial, { paymentTerms: event.target.value }) }))} placeholder="Например, постоплата 30 дней" /></label>
      <label className="request-field span-4"><span>Комментарий</span><textarea rows={4} value={comments} onChange={(event) => setComments(event.target.value)} /></label>
    </div></section>

    <div className="request-sticky-actions"><span className="request-muted">После отправки рабочая заявка не изменится автоматически.</span><button className="button primary" type="submit" disabled={busy}>{busy ? "Отправляем…" : "Отправить менеджеру"}</button></div>
  </form>;
}
