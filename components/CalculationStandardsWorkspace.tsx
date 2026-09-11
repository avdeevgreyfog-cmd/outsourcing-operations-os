"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CalculationModelOption, CalculationRuleConfig } from "@/lib/commercial/calculation-models";
import type { ExpenseStandard, ScheduleStandard } from "@/lib/commercial/calculation-standards";
import { defaultCommercialPolicy, type CommercialPolicy } from "@/lib/commercial/commercial-policy";
import { loadCompanyRulesDraft, saveCompanyRulesDraft } from "@/lib/commercial/company-rules-client";
import { SalesMetrics } from "@/components/sales/SalesUI";

type Tab = "models" | "expenses" | "schedules" | "policy";
type Kind = "model" | "expense" | "schedule";
type Editor = { kind: Kind; action: "create" | "revise"; item?: CalculationModelOption | ExpenseStandard | ScheduleStandard } | null;

const tabs: [Tab, string, string][] = [
  ["models", "Модели оформления", "Способ выплаты, начисления и внутренняя комиссия"],
  ["expenses", "Расходы", "Статьи себестоимости по сотруднику, позиции и проекту"],
  ["schedules", "Графики", "Смены, часы и оплачиваемые перерывы"],
  ["policy", "Коммерческая политика", "Маржа, резерв, НДС, округление и порог согласования"],
];
const today = new Date().toISOString().slice(0, 10);
const groupOptions = ["Регулярное обеспечение", "Периодические и разовые расходы", "Подбор и ротация", "Управление объектом", "Прочие расходы"];
const baseLabels: Record<ExpenseStandard["base"], string> = { per_hour: "₽ / час", per_shift: "₽ / смена", per_worker_month: "₽ / сотр. / мес.", per_worker_period: "на сотрудника", percent_of_worker_pay: "% выплаты", role_month: "₽ / позицию / мес.", role_fixed: "разово на позицию", project_month: "₽ / проект / мес.", project_fixed: "разово на проект", per_unit: "₽ / единицу" };
const scopeLabels = { worker: "Сотрудник", role: "Позиция", project: "Проект" };
const n = (value: FormDataEntryValue | null, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const s = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const localId = () => typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const codeFromName = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `rule-${Date.now()}`;

export function CalculationStandardsWorkspace({ models: initialModels, expenses: initialExpenses, schedules: initialSchedules, initialCommercialPolicy = defaultCommercialPolicy, canManage }: { models: CalculationModelOption[]; expenses: ExpenseStandard[]; schedules: ScheduleStandard[]; initialCommercialPolicy?: CommercialPolicy; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>("models");
  const [models, setModels] = useState(initialModels);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [commercialPolicy, setCommercialPolicy] = useState<CommercialPolicy>(initialCommercialPolicy);
  const [selected, setSelected] = useState(initialModels[0]?.id ?? "");
  const [editor, setEditor] = useState<Editor>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const demo = initialModels.some(model => model.id.startsWith("760")) || initialExpenses.some(item => item.demo) || initialSchedules.some(item => item.demo);

  useEffect(() => {
    if (!demo) return;
    const timer = window.setTimeout(() => {
      const draft = loadCompanyRulesDraft();
      if (!draft) return;
      setModels(draft.models); setExpenses(draft.expenses); setSchedules(draft.schedules); setCommercialPolicy({ ...initialCommercialPolicy, ...(draft.commercialPolicy ?? {}) });
      if (draft.models[0]) setSelected(draft.models[0].id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [demo, initialCommercialPolicy]);

  const active = models.find(model => model.id === selected) ?? models[0];
  const visibleModels = useMemo(() => models.filter(model => `${model.name} ${model.code}`.toLowerCase().includes(query.toLowerCase())), [models, query]);
  const persistDemo = (nextModels = models, nextExpenses = expenses, nextSchedules = schedules, nextPolicy = commercialPolicy) => saveCompanyRulesDraft({ models: nextModels, expenses: nextExpenses, schedules: nextSchedules, commercialPolicy: nextPolicy });
  const metrics = [
    { label: "Моделей оформления", value: models.length, note: "действующих вариантов расчёта" },
    { label: "Статей расходов", value: expenses.length, note: "в себестоимости и обеспечении" },
    { label: "Шаблонов графика", value: schedules.length, note: "для подстановки в сценарии" },
    { label: "Коммерческая политика", value: `${commercialPolicy.recommendedMarginPct}%`, note: "рекомендуемая маржа" },
  ];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const action = editor.action;
    let payload: Record<string, unknown>;
    if (editor.kind === "model") {
      const current = editor.item as CalculationModelOption | undefined;
      const name = s(form.get("name"));
      payload = { kind: "model", action, modelId: current?.id, code: s(form.get("code")) || codeFromName(name), name, modelType: s(form.get("modelType")) || "custom", active: true, effectiveFrom: s(form.get("effectiveFrom")) || today, effectiveTo: null, source: s(form.get("source")) || null, rules: rulesFromForm(form) };
    } else if (editor.kind === "expense") {
      const current = editor.item as ExpenseStandard | undefined;
      const name = s(form.get("name"));
      payload = { kind: "expense", action, code: s(form.get("code")) || current?.code || codeFromName(name), name, groupName: s(form.get("groupName")) || "Прочие расходы", amount: n(form.get("amount")), base: s(form.get("base")) || "per_worker_month", scope: s(form.get("scope")) || "worker", amortizationMonths: form.get("amortizationMonths") ? n(form.get("amortizationMonths")) : null, defaultEnabled: form.get("defaultEnabled") === "on", active: true, effectiveFrom: s(form.get("effectiveFrom")) || today, effectiveTo: null, notes: s(form.get("notes")) || null };
    } else {
      const current = editor.item as ScheduleStandard | undefined;
      const name = s(form.get("name"));
      payload = { kind: "schedule", action, code: s(form.get("code")) || current?.code || codeFromName(name), name, pattern: s(form.get("pattern")), shiftHours: n(form.get("shiftHours")), breakHours: n(form.get("breakHours")), breakPaid: form.get("breakPaid") === "on", shiftsPerMonth: n(form.get("shiftsPerMonth")), active: true, effectiveFrom: s(form.get("effectiveFrom")) || today, effectiveTo: null, notes: s(form.get("notes")) || null };
    }
    setMessage("Сохраняем новую версию…");
    if (demo) { applyDemoChange(payload); return; }
    const response = await fetch("/api/standards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error ?? "Не удалось сохранить правило"); return; }
    applyServerChange(payload, result); setMessage("Новая версия сохранена. Старые расчёты не изменятся."); setEditor(null);
  }

  async function saveCommercialPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: CommercialPolicy = {
      minimumMarginPct: n(form.get("minimumMarginPct")), recommendedMarginPct: n(form.get("recommendedMarginPct")), riskReservePct: n(form.get("riskReservePct")),
      vatPct: n(form.get("vatPct")), roundingStep: n(form.get("roundingStep"), 1), approvalBelowMarginPct: n(form.get("approvalBelowMarginPct")), notes: s(form.get("notes")),
    };
    if (demo) { setCommercialPolicy(next); persistDemo(models, expenses, schedules, next); setMessage("Коммерческая политика сохранена в демо-контуре этого браузера."); return; }
    const previous = commercialPolicy;
    setCommercialPolicy(next); setMessage("Сохраняем новую версию коммерческой политики…");
    const response = await fetch("/api/standards", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({kind:"policy",action:"revise",effectiveFrom:today,effectiveTo:null,policy:next}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setCommercialPolicy(previous); setMessage(result.error ?? "Не удалось сохранить коммерческую политику"); return; }
    const saved = result.policy && typeof result.policy === "object" ? result.policy as CommercialPolicy : next;
    setCommercialPolicy(saved); setMessage(`Коммерческая политика v${result.version ?? "—"} сохранена. Новые расчёты будут использовать эту версию.`);
  }

  function applyDemoChange(payload: Record<string, unknown>) {
    if (payload.kind === "model") {
      const previous = editor?.item as CalculationModelOption | undefined;
      const next: CalculationModelOption = { id: previous?.id ?? `local-model-${localId()}`, name: String(payload.name), code: String(payload.code), ruleVersionId: `local-rule-${localId()}`, ruleVersion: (previous?.ruleVersion ?? 0) + 1, ruleSource: payload.source as string | null, ruleEffectiveFrom: String(payload.effectiveFrom), ruleEffectiveTo: null, rules: payload.rules as CalculationRuleConfig };
      const nextModels = previous ? models.map(item => item.id === previous.id ? next : item) : [...models, next];
      setModels(nextModels); setSelected(next.id); persistDemo(nextModels);
    } else if (payload.kind === "expense") {
      const previous = editor?.item as ExpenseStandard | undefined;
      const next: ExpenseStandard = { id: previous?.id ?? `local-expense-${localId()}`, code:String(payload.code), version:(previous?.version ?? 0) + 1, name:String(payload.name), groupName:String(payload.groupName), amount:Number(payload.amount), base:payload.base as ExpenseStandard["base"], scope:payload.scope as ExpenseStandard["scope"], amortizationMonths:payload.amortizationMonths as number | null, defaultEnabled:Boolean(payload.defaultEnabled), active:true, effectiveFrom:String(payload.effectiveFrom), effectiveTo:null, notes:payload.notes as string | null, demo:true };
      const nextExpenses = previous ? expenses.map(item => item.id === previous.id ? next : item) : [...expenses, next]; setExpenses(nextExpenses); persistDemo(models, nextExpenses);
    } else {
      const previous = editor?.item as ScheduleStandard | undefined;
      const next: ScheduleStandard = { id:previous?.id ?? `local-schedule-${localId()}`, code:String(payload.code), version:(previous?.version ?? 0)+1, name:String(payload.name), pattern:String(payload.pattern), shiftHours:Number(payload.shiftHours), breakHours:Number(payload.breakHours), breakPaid:Boolean(payload.breakPaid), shiftsPerMonth:Number(payload.shiftsPerMonth), active:true, effectiveFrom:String(payload.effectiveFrom), effectiveTo:null, notes:payload.notes as string | null, demo:true };
      const nextSchedules = previous ? schedules.map(item => item.id === previous.id ? next : item) : [...schedules, next]; setSchedules(nextSchedules); persistDemo(models, expenses, nextSchedules);
    }
    setMessage("Сохранено в демонстрационном рабочем контуре этого браузера."); setEditor(null);
  }

  function applyServerChange(payload: Record<string, unknown>, result: Record<string, unknown>) {
    if (payload.kind === "model") {
      const next: CalculationModelOption = { id:String(result.id), name:String(result.name), code:String(result.code), ruleVersionId:String(result.ruleVersionId), ruleVersion:Number(result.ruleVersion), ruleSource:result.ruleSource as string | null, ruleEffectiveFrom:result.ruleEffectiveFrom as string | null, ruleEffectiveTo:result.ruleEffectiveTo as string | null, rules:result.rules as CalculationRuleConfig };
      setModels(current => current.some(item => item.id === next.id) ? current.map(item => item.id === next.id ? next : item) : [...current, next]); setSelected(next.id);
    } else if (payload.kind === "expense") setExpenses(current => [result as unknown as ExpenseStandard, ...current.filter(item => item.code !== result.code)]);
    else setSchedules(current => [result as unknown as ScheduleStandard, ...current.filter(item => item.code !== result.code)]);
  }

  async function archive(kind: Kind, item: CalculationModelOption | ExpenseStandard | ScheduleStandard) {
    if (!canManage) return;
    if (demo) {
      if (kind === "model") { const next = models.filter(model => model.id !== item.id); setModels(next); persistDemo(next); if (selected === item.id) setSelected(next[0]?.id ?? ""); }
      if (kind === "expense") { const next = expenses.filter(expense => expense.id !== item.id); setExpenses(next); persistDemo(models, next); }
      if (kind === "schedule") { const next = schedules.filter(schedule => schedule.id !== item.id); setSchedules(next); persistDemo(models, expenses, next); }
      setMessage("Правило отключено. Исторические расчёты сохранены."); return;
    }
    const payload = kind === "model" ? {kind,action:"archive",modelId:item.id,code:item.code,name:item.name,modelType:"custom",active:false,effectiveFrom:today,rules:{}} : kind === "expense" ? {...item,kind,action:"archive",active:false,effectiveFrom:today} : {...item,kind,action:"archive",active:false,effectiveFrom:today};
    const response = await fetch("/api/standards", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error ?? "Не удалось отключить правило"); return; }
    if (kind === "model") setModels(current => current.filter(model => model.id !== item.id));
    if (kind === "expense") setExpenses(current => current.filter(expense => expense.id !== item.id));
    if (kind === "schedule") setSchedules(current => current.filter(schedule => schedule.id !== item.id));
    setMessage("Правило отключено. В новые расчёты оно не попадёт.");
  }

  const addAction = <button className="button primary" type="button" disabled={!canManage || tab === "policy"} onClick={() => setEditor({kind:tab === "models" ? "model" : tab === "expenses" ? "expense" : "schedule",action:"create"})}>+ {tab === "models" ? "Модель" : tab === "expenses" ? "Расход" : "График"}</button>;

  return <div className="standards-workspace">
    <SalesMetrics label="Сводка нормативов" items={metrics}/>
    {demo && <div className="standards-demo-note"><strong>Демо-контур.</strong><span>Изменения нормативов сохраняются в этом браузере и не влияют на серверные данные.</span></div>}
    <div className="standards-tabs" role="tablist">{tabs.map(([key,label,note]) => <button key={key} className={`standards-tab ${tab === key ? "is-active" : ""}`} role="tab" aria-selected={tab === key} title={note} onClick={() => { setTab(key); setEditor(null); setMessage(""); }}><strong>{label}</strong><small>{note}</small></button>)}</div>
    {message && <p className="calculation-save-message">{message}</p>}

    {tab === "models" && <div className="standards-grid"><section className="section"><div className="section-head"><div><h2>Модели оформления</h2><p>Выберите базовую модель оформления или добавьте собственную.</p></div>{addAction}</div><div className="standards-toolbar"><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск модели"/></div><div className="standards-model-list">{visibleModels.map(model => <button key={model.id} className={`standards-model ${active?.id === model.id ? "is-selected" : ""}`} onClick={() => setSelected(model.id)}><span><strong>{model.name}</strong><small>{model.code} · правила №{model.ruleVersion ?? "—"}</small></span><em>{model.rules.payStructure === "mrot_plus_supplement" ? "База + доплата" : "Полная выплата"}</em></button>)}</div></section><section className="section standards-detail">{active ? <ModelDetail model={active} canManage={canManage} onEdit={() => setEditor({kind:"model",action:"revise",item:active})} onArchive={() => archive("model",active)}/> : <p className="standards-empty">Нет активных моделей.</p>}</section></div>}

    {tab === "expenses" && <section className="section"><div className="section-head"><div><h2>Расходы</h2><p>Отключённая статья не попадёт в новые расчёты. Старые версии останутся без изменений.</p></div>{addAction}</div>{editor?.kind === "expense" && <ExpenseForm item={editor.item as ExpenseStandard | undefined} onSubmit={save} onCancel={() => setEditor(null)}/>}<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Наименование</th><th>Группа</th><th>База</th><th>Контур</th><th>Версия</th><th></th></tr></thead><tbody>{expenses.map(item => <tr key={item.id}><td><strong>{item.name}</strong><span className="cell-sub">{item.defaultEnabled ? "Включён по умолчанию" : "По выбору"}</span></td><td>{item.groupName}</td><td>{baseLabels[item.base]}</td><td>{scopeLabels[item.scope]}</td><td>v{item.version}</td><td><RowActions canManage={canManage} onEdit={() => setEditor({kind:"expense",action:"revise",item})} onArchive={() => archive("expense",item)}/></td></tr>)}</tbody></table></div></section>}

    {tab === "schedules" && <section className="section"><div className="section-head"><div><h2>Шаблоны графиков</h2><p>График подставляет оплачиваемые часы и число смен, но их можно скорректировать в сценарии.</p></div>{addAction}</div>{editor?.kind === "schedule" && <ScheduleForm item={editor.item as ScheduleStandard | undefined} onSubmit={save} onCancel={() => setEditor(null)}/>}<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Шаблон</th><th>Смена</th><th>Норма</th><th>Перерыв</th><th>Версия</th><th></th></tr></thead><tbody>{schedules.map(item => <tr key={item.id}><td><strong>{item.name}</strong><span className="cell-sub">{item.pattern}</span></td><td>{item.shiftHours} ч</td><td>{item.shiftsPerMonth} смен</td><td>{item.breakHours} ч · {item.breakPaid ? "оплачивается" : "не оплачивается"}</td><td>v{item.version}</td><td><RowActions canManage={canManage} onEdit={() => setEditor({kind:"schedule",action:"revise",item})} onArchive={() => archive("schedule",item)}/></td></tr>)}</tbody></table></div></section>}

    {tab === "policy" && <section className="section"><div className="section-head"><div><h2>Коммерческая политика</h2><p>Общие ориентиры цены и согласования. Они применяются ко всем новым сценариям и не зависят от формы оформления.</p></div></div><CommercialPolicyForm value={commercialPolicy} disabled={!canManage} onSubmit={saveCommercialPolicy}/></section>}

    {tab === "models" && editor?.kind === "model" && <ModelForm item={editor.item as CalculationModelOption | undefined} action={editor.action} onSubmit={save} onCancel={() => setEditor(null)}/>}
  </div>;
}

function ModelDetail({model,canManage,onEdit,onArchive}:{model:CalculationModelOption;canManage:boolean;onEdit:()=>void;onArchive:()=>void}) { return <><div className="section-head"><div><h2>{model.name}</h2><p>Версия правил №{model.ruleVersion ?? "—"} · действует с {model.ruleEffectiveFrom ?? "—"}</p></div><div className="calculation-inline-actions"><button className="button" disabled={!canManage} onClick={onEdit}>Настроить</button><button className="button danger" disabled={!canManage} onClick={onArchive}>Отключить</button></div></div><RulesTable rules={model.rules}/><div className="standards-source"><strong>{model.rules.payStructure === "mrot_plus_supplement" ? "Модель: официальная база + доплата" : "Модель: полная выплата"}</strong><p>{model.ruleSource || "Источник или внутреннее правило компании не указаны."}</p></div></>; }
function RulesTable({rules}:{rules:CalculationRuleConfig}) { return <div className="standards-rule-cards"><div><small>Начисления</small><strong>{rules.mandatoryChargePct ?? 0}%</strong></div><div><small>База начислений</small><strong>{rules.mandatoryChargeBase === "official_base" ? "Официальная" : "Полная"}</strong></div>{rules.payStructure === "mrot_plus_supplement" && <><div><small>База / сотр. / мес.</small><strong>{Number(rules.officialBasePerWorkerMonthly ?? 0).toLocaleString("ru-RU")} ₽</strong></div><div><small>Комиссия доплаты</small><strong>{rules.supplementCommissionPct ?? 0}%</strong></div></>}</div>; }
function RowActions({canManage,onEdit,onArchive}:{canManage:boolean;onEdit:()=>void;onArchive:()=>void}) { return <div className="calculation-row-actions"><button className="button" disabled={!canManage} onClick={onEdit}>Изменить</button><button className="button danger" disabled={!canManage} onClick={onArchive}>Отключить</button></div>; }

function CommercialPolicyForm({ value, disabled, onSubmit }: { value: CommercialPolicy; disabled: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="calculation-inline-form calculation-policy-form" onSubmit={onSubmit}>
    <label>Минимальная маржа, %<input className="input" name="minimumMarginPct" type="number" min="0" max="95" step="0.01" defaultValue={value.minimumMarginPct}/><small>Ниже этого уровня расчёт требует отдельного решения.</small></label>
    <label>Рекомендуемая маржа, %<input className="input" name="recommendedMarginPct" type="number" min="0" max="95" step="0.01" defaultValue={value.recommendedMarginPct}/></label>
    <label>Резерв рисков, %<input className="input" name="riskReservePct" type="number" min="0" max="100" step="0.01" defaultValue={value.riskReservePct}/><small>Добавляется к себестоимости каждого нового сценария.</small></label>
    <label>НДС, %<input className="input" name="vatPct" type="number" min="0" max="100" step="0.01" defaultValue={value.vatPct}/></label>
    <label>Шаг округления, ₽<input className="input" name="roundingStep" type="number" min="0.01" step="0.01" defaultValue={value.roundingStep}/></label>
    <label>Порог согласования, %<input className="input" name="approvalBelowMarginPct" type="number" min="0" max="95" step="0.01" defaultValue={value.approvalBelowMarginPct}/><small>Используйте для настройки маршрута согласования.</small></label>
    <label className="calculation-form-wide">Пояснение для команды<textarea className="input" name="notes" defaultValue={value.notes}/></label>
    <div className="calculation-inline-actions"><button className="button primary" disabled={disabled} type="submit">Сохранить новую версию политики</button></div>
  </form>;
}

function ModelForm({item,action,onSubmit,onCancel}:{item?:CalculationModelOption;action:"create"|"revise";onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) { const rules=item?.rules ?? {}; return <form className="calculation-inline-form calculation-model-form" onSubmit={onSubmit}><label>Название<input className="input" name="name" required defaultValue={item?.name ?? "Новая модель компании"}/></label><label>Код<input className="input" name="code" pattern="[a-z0-9_-]+" defaultValue={item?.code ?? ""} placeholder="mrot_supplement"/></label><label>Тип<select name="modelType" defaultValue={item?.code === "employment" ? "employment" : item?.code === "gph" ? "gph" : item?.code === "npd" ? "npd" : "custom"}><option value="employment">Трудовой договор</option><option value="gph">ГПХ</option><option value="npd">НПД</option><option value="custom">Собственная модель</option></select></label><label>Дата действия<input className="input" name="effectiveFrom" type="date" required defaultValue={item?.ruleEffectiveFrom ?? today}/></label><label>Структура выплаты<select name="payStructure" defaultValue={rules.payStructure ?? "full_pay"}><option value="full_pay">Полная выплата</option><option value="mrot_plus_supplement">Официальная база + доплата</option></select></label><label>Официальная база / сотр. / мес.<input className="input" name="officialBasePerWorkerMonthly" type="number" min="0" step="0.01" defaultValue={rules.officialBasePerWorkerMonthly ?? 0}/></label><label>Начисления считать от<select name="mandatoryChargeBase" defaultValue={rules.mandatoryChargeBase ?? "full_pay"}><option value="full_pay">Полной выплаты</option><option value="official_base">Официальной базы</option></select></label><label>Начисления, %<input className="input" name="mandatoryChargePct" type="number" min="0" max="100" step="0.01" defaultValue={rules.mandatoryChargePct ?? 0}/></label><label>Комиссия доплаты, %<input className="input" name="supplementCommissionPct" type="number" min="0" max="100" step="0.01" defaultValue={rules.supplementCommissionPct ?? 0}/></label><label>Комиссия доплаты, ₽/сотр./мес.<input className="input" name="supplementCommissionFixedPerWorkerMonthly" type="number" min="0" step="0.01" defaultValue={rules.supplementCommissionFixedPerWorkerMonthly ?? 0}/></label><label className="calculation-checkbox"><input name="legalParametersVerified" type="checkbox" defaultChecked={Boolean(rules.legalParametersVerified)}/> Проверено компанией</label><label className="calculation-form-wide">Источник / пояснение<textarea className="input" name="source" defaultValue={item?.ruleSource ?? ""} placeholder="Внутреннее правило компании или ссылка на проверенный источник"/></label><input type="hidden" name="mandatoryChargeFixedHourly" value={rules.mandatoryChargeFixedHourly ?? 0}/><div className="calculation-inline-actions"><button className="button primary" type="submit">{action === "create" ? "Создать модель" : "Сохранить новую версию"}</button><button className="button" type="button" onClick={onCancel}>Отмена</button></div></form>; }
function ExpenseForm({item,onSubmit,onCancel}:{item?:ExpenseStandard;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) { return <form className="calculation-inline-form" onSubmit={onSubmit}><label>Наименование<input className="input" name="name" required defaultValue={item?.name}/></label><label>Код<input className="input" name="code" defaultValue={item?.code} pattern="[a-z0-9_-]+"/></label><label>Группа<select name="groupName" defaultValue={item?.groupName ?? groupOptions[0]}>{groupOptions.map(group => <option key={group}>{group}</option>)}</select></label><label>Сумма<input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={item?.amount ?? 0}/></label><label>База<select name="base" defaultValue={item?.base ?? "per_worker_month"}>{Object.entries(baseLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Контур<select name="scope" defaultValue={item?.scope ?? "worker"}>{Object.entries(scopeLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Амортизация, мес.<input className="input" name="amortizationMonths" type="number" min="0.1" step="0.1" defaultValue={item?.amortizationMonths ?? ""}/></label><label>Дата действия<input className="input" name="effectiveFrom" type="date" defaultValue={item?.effectiveFrom ?? today}/></label><label className="calculation-checkbox"><input name="defaultEnabled" type="checkbox" defaultChecked={item?.defaultEnabled}/> Включать по умолчанию</label><label className="calculation-form-wide">Комментарий<textarea className="input" name="notes" defaultValue={item?.notes ?? ""}/></label><div className="calculation-inline-actions"><button className="button primary" type="submit">Сохранить версию</button><button className="button" type="button" onClick={onCancel}>Отмена</button></div></form>; }
function ScheduleForm({item,onSubmit,onCancel}:{item?:ScheduleStandard;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) { return <form className="calculation-inline-form" onSubmit={onSubmit}><label>Название<input className="input" name="name" required defaultValue={item?.name}/></label><label>Код<input className="input" name="code" defaultValue={item?.code} pattern="[a-z0-9_-]+"/></label><label>Паттерн<input className="input" name="pattern" required defaultValue={item?.pattern}/></label><label>Смена, ч<input className="input" name="shiftHours" type="number" min="0.1" step="0.1" defaultValue={item?.shiftHours ?? 11}/></label><label>Перерыв, ч<input className="input" name="breakHours" type="number" min="0" step="0.1" defaultValue={item?.breakHours ?? 0}/></label><label>Смен в месяц<input className="input" name="shiftsPerMonth" type="number" min="0.1" step="0.1" defaultValue={item?.shiftsPerMonth ?? 21}/></label><label>Дата действия<input className="input" name="effectiveFrom" type="date" defaultValue={item?.effectiveFrom ?? today}/></label><label className="calculation-checkbox"><input name="breakPaid" type="checkbox" defaultChecked={item?.breakPaid}/> Перерыв оплачивается</label><label className="calculation-form-wide">Комментарий<textarea className="input" name="notes" defaultValue={item?.notes ?? ""}/></label><div className="calculation-inline-actions"><button className="button primary" type="submit">Сохранить версию</button><button className="button" type="button" onClick={onCancel}>Отмена</button></div></form>; }
function rulesFromForm(form: FormData): CalculationRuleConfig { return { mandatoryChargePct:n(form.get("mandatoryChargePct")), mandatoryChargeFixedHourly:n(form.get("mandatoryChargeFixedHourly")), legalParametersVerified:form.get("legalParametersVerified") === "on", payStructure:s(form.get("payStructure")) === "mrot_plus_supplement" ? "mrot_plus_supplement" : "full_pay", officialBasePerWorkerMonthly:n(form.get("officialBasePerWorkerMonthly")), mandatoryChargeBase:s(form.get("mandatoryChargeBase")) === "official_base" ? "official_base" : "full_pay", supplementCommissionPct:n(form.get("supplementCommissionPct")), supplementCommissionFixedPerWorkerMonthly:n(form.get("supplementCommissionFixedPerWorkerMonthly")) }; }
