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
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
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

  if (sent) return <div className="public-request-card public-request-success"><h2>Информация отправлена</h2><p>Менеджер получил новую версию заявки. После проверки он примет изменения в рабочую заявку.</p></div>;

  return <form className="request-editor-main" onSubmit={submit}>
    <section className="public-request-card" id="public-general">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Основная информация</h2><p>Проверьте уже заполненные данные и дополните то, чего не хватает.</p></div></div>
      <div className="request-form-grid">
        <div className="request-field span-2"><span>Компания</span><input value={intake.companyName} onChange={(event) => setIntake({ ...intake, companyName: event.target.value })} placeholder={context.company || "Название компании"} /></div>
        <div className="request-field"><span>Название / предмет заявки</span><input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="request-field span-2"><span>Адрес / локация</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></div>
        <div className="request-field"><span>Регион</span><select value={regionId} onChange={(event) => setRegionId(event.target.value)}><option value="">Не указан</option>{context.regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="request-field"><span>Город</span><input value={intake.object.city} onChange={(event) => setIntake({ ...intake, object: patch(intake.object, { city: event.target.value }) })} /></div>
        <div className="request-field"><span>Объект / площадка</span><input value={intake.object.siteName} onChange={(event) => setIntake({ ...intake, object: patch(intake.object, { siteName: event.target.value }) })} /></div>
        <div className="request-field"><span>Метро / ориентир</span><input value={intake.object.landmark} onChange={(event) => setIntake({ ...intake, object: patch(intake.object, { landmark: event.target.value }) })} /></div>
        <div className="request-field"><span>Контактное лицо</span><input value={intake.contact.name} onChange={(event) => setIntake({ ...intake, contact: patch(intake.contact, { name: event.target.value }) })} /></div>
        <div className="request-field"><span>Телефон</span><input type="tel" value={intake.contact.phone} onChange={(event) => setIntake({ ...intake, contact: patch(intake.contact, { phone: event.target.value }) })} /></div>
        <div className="request-field"><span>Email</span><input type="email" value={intake.contact.email} onChange={(event) => setIntake({ ...intake, contact: patch(intake.contact, { email: event.target.value }) })} /></div>
        <div className="request-field"><span>Мессенджер</span><select value={intake.contact.messengerType} onChange={(event) => setIntake({ ...intake, contact: patch(intake.contact, { messengerType: event.target.value }) })}><option value="">Не указан</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="other">Другой</option></select></div>
        <div className="request-field span-2"><span>Контакт в мессенджере</span><input value={intake.contact.messenger} onChange={(event) => setIntake({ ...intake, contact: patch(intake.contact, { messenger: event.target.value }) })} /></div>
      </div>
    </section>

    <section className="public-request-card">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Сроки и график</h2><p>Эти параметры нужны, чтобы корректно рассчитать количество людей и стоимость.</p></div></div>
      <div className="request-form-grid">
        <div className="request-field"><span>Плановый старт</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
        <div className="request-field span-2"><span>На какой срок нужны сотрудники</span><input value={durationText} onChange={(event) => setDurationText(event.target.value)} placeholder="Например: более 12 месяцев" /></div>
        <div className="request-field"><span>Потребность</span><select value={intake.volume.demandType} onChange={(event) => setIntake({ ...intake, volume: patch(intake.volume, { demandType: event.target.value }) })}><option value="fixed">Постоянная численность</option><option value="variable">Плавающая</option><option value="on_demand">По заявке</option><option value="unknown">Не определено</option></select></div>
        <div className="request-field"><span>Людей на первый выход</span><input type="number" min="0" value={intake.volume.startHeadcount ?? ""} onChange={(event) => setIntake({ ...intake, volume: patch(intake.volume, { startHeadcount: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Общий график</span><select value={intake.schedule.pattern} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { pattern: event.target.value }) })}><option value="">Не указан</option><option value="5/2">5/2</option><option value="6/1">6/1</option><option value="7/0">7/0</option><option value="2/2">2/2</option><option value="3/3">3/3</option><option value="rotation">Вахта</option><option value="flexible">Гибкий / по заявке</option><option value="custom">Другой</option></select></div>
        {intake.schedule.pattern === "custom" && <div className="request-field"><span>Укажите график</span><input value={intake.schedule.customPattern} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { customPattern: event.target.value }) })} /></div>}
        <div className="request-field"><span>Часов присутствия</span><input type="number" step="0.5" min="0" max="24" value={intake.schedule.presenceHours ?? ""} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { presenceHours: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Оплачиваемых часов</span><input type="number" step="0.5" min="0" max="24" value={intake.schedule.paidHours ?? ""} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { paidHours: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Обед, минут</span><input type="number" min="0" value={intake.schedule.lunchMinutes ?? ""} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { lunchMinutes: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Обед</span><select value={intake.schedule.lunchPaid ? "paid" : "unpaid"} onChange={(event) => setIntake({ ...intake, schedule: patch(intake.schedule, { lunchPaid: event.target.value === "paid" }) })}><option value="unpaid">Не оплачивается</option><option value="paid">Оплачивается</option></select></div>
      </div>
    </section>

    <section className="public-request-card">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Какие сотрудники нужны</h2><p>Для каждой позиции можно добавить квалификацию и коротко описать задачи.</p></div><button type="button" className="button" onClick={() => setRoles([...roles, { id: "", specialtyId: context.specialties[0]?.id ?? "", specialty: context.specialties[0]?.name ?? "", count: 1, schedule: {}, requirements: {}, targetClientRate: null, scheduleOverride: false }])}>+ Позиция</button></div>
      <div className="request-role-list">{roles.map((role, index) => <div className="request-role-card" key={role.id || `public-${index}`}><div className="request-role-details" style={{ borderTop: 0 }}><div className="request-form-grid">
        <div className="request-field span-2"><span>Специальность</span><select value={role.specialtyId} onChange={(event) => rolePatch(index, { specialtyId: event.target.value, specialty: context.specialties.find((item) => item.id === event.target.value)?.name ?? "" })}>{context.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="request-field"><span>Количество</span><input type="number" min="1" value={role.count} onChange={(event) => rolePatch(index, { count: Number(event.target.value) })} /></div>
        <div className="request-field"><span>Разряд / квалификация</span><input value={text(role.requirements.grade)} onChange={(event) => reqPatch(index, "grade", event.target.value)} /></div>
        <div className="request-field"><span>Опыт</span><input value={text(role.requirements.experience)} onChange={(event) => reqPatch(index, "experience", event.target.value)} /></div>
        <div className="request-field span-all"><span>Что будет делать сотрудник</span><textarea rows={2} value={text(role.requirements.description)} onChange={(event) => reqPatch(index, "description", event.target.value)} /></div>
        <div className="request-field span-2"><span>Удостоверения / допуски / корочки</span><input value={text(role.requirements.certificates)} onChange={(event) => reqPatch(index, "certificates", event.target.value)} /></div>
        <div className="request-field span-2"><span>Дополнительные требования</span><input value={text(role.requirements.skills)} onChange={(event) => reqPatch(index, "skills", event.target.value)} /></div>
      </div><div style={{ marginTop: 10 }}><button type="button" className="request-subtle-action" onClick={() => setRoles(roles.filter((_, roleIndex) => roleIndex !== index))}>Удалить позицию</button></div></div></div>)}</div>
    </section>

    <section className="public-request-card">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Обеспечение и логистика</h2><p>Укажите, кто обеспечивает основные условия. Если информации пока нет, оставьте «Нужно уточнить».</p></div></div>
      <div style={{ overflowX: "auto" }}><table className="request-provision"><thead><tr><th>Условие</th><th>Кто обеспечивает</th><th>Комментарий</th></tr></thead><tbody>{provisionKeys.map((key) => <tr key={key}><td><strong>{provisionLabels[key]}</strong></td><td><select value={intake.provision[key].provider} onChange={(event) => changeProvision(key, { provider: event.target.value })}>{providerOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></td><td><input value={intake.provision[key].comment} onChange={(event) => changeProvision(key, { comment: event.target.value })} /></td></tr>)}</tbody></table></div>
    </section>

    <section className="public-request-card">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Требования и допуск</h2><p>Отметьте требования к сотрудникам и обязательные проверки.</p></div></div>
      <div className="request-field span-all"><span>Допустимые категории работников</span><div className="request-check-grid">{workerCategories.map(([code,label]) => <label className="request-check-item" key={code}><input type="checkbox" checked={intake.compliance.workerCategories.includes(code)} onChange={(event) => setIntake({ ...intake, compliance: patch(intake.compliance, { workerCategories: event.target.checked ? [...intake.compliance.workerCategories, code] : intake.compliance.workerCategories.filter((item) => item !== code) }) })} />{label}</label>)}</div></div>
      <div className="request-field span-all" style={{ marginTop: 12 }}><span>Проверки / документы</span><div className="request-check-grid">{documentChecks.map(([code,label]) => <label className="request-check-item" key={code}><input type="checkbox" checked={intake.compliance.documentChecks.includes(code)} onChange={(event) => setIntake({ ...intake, compliance: patch(intake.compliance, { documentChecks: event.target.checked ? [...intake.compliance.documentChecks, code] : intake.compliance.documentChecks.filter((item) => item !== code) }) })} />{label}</label>)}</div></div>
      <div className="request-field span-all" style={{ marginTop: 12 }}><span>Дополнительные требования</span><textarea rows={2} value={intake.compliance.comment} onChange={(event) => setIntake({ ...intake, compliance: patch(intake.compliance, { comment: event.target.value }) })} /></div>
    </section>

    <section className="public-request-card">
      <div className="request-panel-head" style={{ padding: 0, marginBottom: 14 }}><div><h2>Коммерческие ориентиры</h2><p>Раздел необязательный. Он помогает быстрее подготовить реалистичное предложение.</p></div></div>
      <div className="request-form-grid">
        <div className="request-field"><span>Формат оплаты</span><select value={intake.commercial.billingUnit} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { billingUnit: event.target.value }) })}><option value="unknown">Пока неизвестно</option><option value="hour">Человеко-час</option><option value="shift">Смена</option><option value="worker_month">Сотрудник / месяц</option><option value="unit">Единица</option><option value="volume">За объём</option><option value="fixed">Фикс за проект</option><option value="mixed">Смешанная</option></select></div>
        <div className="request-field"><span>Максимальная ставка / бюджет</span><input type="number" min="0" value={intake.commercial.clientLimit ?? ""} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { clientLimit: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Бюджет указан</span><select value={intake.commercial.clientLimitVatMode} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { clientLimitVatMode: event.target.value }) })}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option></select></div>
        <div className="request-field"><span>Желаемая зарплата сотруднику</span><input type="number" min="0" value={intake.commercial.desiredWorkerNet ?? ""} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { desiredWorkerNet: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>Известная ставка конкурента</span><input type="number" min="0" value={intake.commercial.competitorRate ?? ""} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { competitorRate: event.target.value ? Number(event.target.value) : null }) })} /></div>
        <div className="request-field"><span>НДС</span><select value={vatMode} onChange={(event) => setVatMode(event.target.value)}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select></div>
        <div className="request-field span-all"><span>Условия оплаты / отсрочка</span><input value={intake.commercial.paymentTerms} onChange={(event) => setIntake({ ...intake, commercial: patch(intake.commercial, { paymentTerms: event.target.value }) })} /></div>
      </div>
    </section>

    <section className="public-request-card"><div className="request-field span-all"><span>Дополнительная информация</span><textarea rows={4} value={comments} onChange={(event) => setComments(event.target.value)} /></div></section>
    {error && <div className="form-error">{error}</div>}
    <div className="request-sticky-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Отправка..." : "Отправить менеджеру"}</button><span className="request-muted">После отправки менеджер увидит изменения и проверит их перед применением.</span></div>
  </form>;
}
