"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Download, Plus, Save, Trash2 } from "lucide-react";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
import type { CalculationModelOption } from "@/lib/commercial/calculation-models";
import { pct, rub } from "@/lib/ui/format";

type Base = "per_hour" | "per_shift" | "per_worker_month" | "project_month" | "project_fixed" | "per_unit";
type Cost = { id: string; group: string; label: string; amount: number; base: Base; enabled: boolean };
type BillingUnit = "hour" | "shift" | "unit" | "worker_month" | "project_month" | "project_fixed" | "mixed";
type WorkerPayUnit = "hour" | "shift" | "month";
type PricingMode = "target_margin" | "client_limit";
type ContextRole = { id: string; specialty: string; count: number; schedule?: Record<string, unknown>; targetClientRate?: number | string | null };
type Context = {
  requestId: string;
  roles: ContextRole[];
  models: CalculationModelOption[];
  vatMode?: string | null;
  schedule?: Record<string, unknown>;
};

const groups = ["Налоги и обязательные начисления", "Регулярное обеспечение", "Транспорт и проживание", "СИЗ и медицина", "Подбор и управление", "Прочие расходы"];
const initial: Cost[] = [
  { id: "housing", group: groups[2], label: "Проживание", amount: 400, base: "per_shift", enabled: true },
  { id: "travel", group: groups[2], label: "Проезд и логистика", amount: 18, base: "per_hour", enabled: true },
  { id: "ppe", group: groups[3], label: "СИЗ и спецодежда", amount: 2100, base: "per_worker_month", enabled: true },
  { id: "medical", group: groups[3], label: "Медицина", amount: 0, base: "per_worker_month", enabled: false },
  { id: "recruit", group: groups[4], label: "Подбор и запуск", amount: 35000, base: "project_month", enabled: true },
  { id: "manager", group: groups[4], label: "Управление объектом", amount: 65000, base: "project_month", enabled: true },
];

const fallbackModels: CalculationModelOption[] = [
  { id: "standalone-employment", name: "Трудовой договор", code: "employment", ruleVersionId: null, ruleVersion: null, ruleSource: null, rules: {} },
  { id: "standalone-gph", name: "ГПХ", code: "gph", ruleVersionId: null, ruleVersion: null, ruleSource: null, rules: {} },
  { id: "standalone-npd", name: "НПД / самозанятый", code: "npd", ruleVersionId: null, ruleVersion: null, ruleSource: null, rules: {} },
  { id: "standalone-custom", name: "Модель компании", code: "custom", ruleVersionId: null, ruleVersion: null, ruleSource: null, rules: {} },
];

const billingLabels: Record<BillingUnit, string> = {
  hour: "₽ / час",
  shift: "₽ / смена",
  unit: "₽ / единица",
  worker_month: "₽ / сотрудник / месяц",
  project_month: "₽ / проект / месяц",
  project_fixed: "Фикс за проект",
  mixed: "Фикс + переменная часть",
};

const simpleBillingLabels: Record<Exclude<BillingUnit, "mixed" | "project_fixed">, string> = {
  hour: "час",
  shift: "смена",
  unit: "единица",
  worker_month: "сотрудник / месяц",
  project_month: "проект / месяц",
};

const warningLabels: Record<string, string> = {
  below_minimum_margin: "Маржа ниже минимального норматива компании",
  above_client_limit: "Расчётная ставка выше указанного лимита клиента",
  rules_unverified: "Активная версия правил помечена как непроверенная",
  rule_version_missing: "Для модели не найдена действующая версия правил",
};

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function CalculatorWorkspace({ context }: { context?: Context }) {
  const router = useRouter();
  const models = context?.models?.length ? context.models : fallbackModels;
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((item) => item.id === modelId) ?? models[0];
  const [selectedRoleId, setSelectedRoleId] = useState(context?.roles[0]?.id ?? "");
  const selectedRole = context?.roles.find((role) => role.id === selectedRoleId);
  const roleSchedule = selectedRole?.schedule ?? context?.schedule ?? {};
  const initialPaidHours = num(roleSchedule.paidHours, 11);
  const initialHoursPerWorker = initialPaidHours * 22;
  const [scenarioName, setScenarioName] = useState("Базовый сценарий");
  const [saveState, setSaveState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });
  const [workerPayAmount, setWorkerPayAmount] = useState(390);
  const [workerPayUnit, setWorkerPayUnit] = useState<WorkerPayUnit>("hour");
  const [workers, setWorkers] = useState(selectedRole?.count ?? 24);
  const [hours, setHours] = useState(initialHoursPerWorker);
  const [shiftHours, setShiftHours] = useState(initialPaidHours);
  const [shifts, setShifts] = useState(22);
  const [projectMonths, setProjectMonths] = useState(1);
  const [pricingMode, setPricingMode] = useState<PricingMode>("target_margin");
  const [margin, setMargin] = useState(Number(model?.rules.recommendedMarginPct ?? 18));
  const [clientLimit, setClientLimit] = useState(Number(selectedRole?.targetClientRate ?? 0));
  const [clientLimitVatMode, setClientLimitVatMode] = useState<"with_vat" | "without_vat">(context?.vatMode === "with_vat" ? "with_vat" : "without_vat");
  const [billingUnit, setBillingUnit] = useState<BillingUnit>("hour");
  const [variableBillingUnit, setVariableBillingUnit] = useState<"hour" | "shift" | "unit">("hour");
  const [unitsPerWorkerShift, setUnitsPerWorkerShift] = useState(100);
  const [fixedMonthlyNet, setFixedMonthlyNet] = useState(0);
  const [minimumMonthlyNet, setMinimumMonthlyNet] = useState(0);
  const [vatMode, setVatMode] = useState(context?.vatMode ?? "with_vat");
  const [vatPct, setVatPct] = useState(Number(model?.rules.vatPct ?? 0));
  const [costs, setCosts] = useState(initial);

  const result = useMemo(() => calculateCommercialScenario({
    workers,
    hoursPerWorker: hours,
    hoursPerShift: shiftHours,
    shiftsPerWorker: shifts,
    projectMonths,
    workerPayAmount,
    workerPayUnit,
    pricingMode,
    targetMarginPct: margin,
    clientLimit: clientLimit || null,
    clientLimitVatMode,
    billingUnit,
    variableBillingUnit,
    unitsPerWorkerShift,
    fixedMonthlyNet,
    minimumMonthlyNet,
    vatMode,
    vatPct,
    roundingStep: model?.rules.roundingStep,
    rules: model?.rules ?? {},
    ruleVersionId: model?.ruleVersionId ?? null,
    costs,
  }), [workers, hours, shiftHours, shifts, projectMonths, workerPayAmount, workerPayUnit, pricingMode, margin, clientLimit, clientLimitVatMode, billingUnit, variableBillingUnit, unitsPerWorkerShift, fixedMonthlyNet, minimumMonthlyNet, vatMode, vatPct, model, costs]);

  function update(id: string, patch: Partial<Cost>) { setCosts((value) => value.map((cost) => cost.id === id ? { ...cost, ...patch } : cost)); }
  function add(group: string) { setCosts((value) => [...value, { id: crypto.randomUUID(), group, label: "Новая статья", amount: 0, base: "per_hour", enabled: true }]); }
  function duplicate(cost: Cost) { setCosts((value) => [...value, { ...cost, id: crypto.randomUUID(), label: `${cost.label} — копия` }]); }
  function selectModel(nextId: string) {
    setModelId(nextId);
    const next = models.find((item) => item.id === nextId);
    if (next) {
      setMargin(Number(next.rules.recommendedMarginPct ?? margin));
      setVatPct(Number(next.rules.vatPct ?? vatPct));
    }
  }
  function selectRole(nextId: string) {
    setSelectedRoleId(nextId);
    const role = context?.roles.find((item) => item.id === nextId);
    if (!role) return;
    setWorkers(role.count);
    const paidHours = num(role.schedule?.paidHours ?? context?.schedule?.paidHours, shiftHours);
    setShiftHours(paidHours);
    setHours(paidHours * shifts);
    setClientLimit(Number(role.targetClientRate ?? 0));
  }
  function exportSummary() {
    const lines: Array<Array<string | number>> = [
      ["Показатель", "Значение"],
      ["Модель", model?.name ?? "—"],
      ["Версия правил", model?.ruleVersion ?? "—"],
      ["Способ цены", pricingMode === "target_margin" ? "От целевой маржи" : "От лимита клиента"],
      ["Единица тарификации", billingLabels[billingUnit]],
      ["Себестоимость / час", result.totalCostHourly],
      ["Ставка клиенту без НДС", result.clientRateNet],
      ["Ставка клиенту с НДС", result.clientRateGross],
      ["Маржа, %", result.marginPct],
      ["Выручка без НДС / месяц", result.monthlyRevenueNet],
      ["Прибыль / месяц", result.monthlyContribution],
    ];
    const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = "расчёт-сценария.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function saveScenario() {
    if (!context || !selectedRoleId || !model) return;
    setSaveState({ busy: true, message: "", error: false });
    const inputs = {
      workerPayAmount, workerPayUnit, workers, hoursPerWorker: hours, shiftHours, shiftsPerWorker: shifts, projectMonths,
      pricingMode, targetMarginPct: margin, clientLimit: clientLimit || null, clientLimitVatMode,
      billingUnit, variableBillingUnit, unitsPerWorkerShift, fixedMonthlyNet, minimumMonthlyNet,
      vatMode, vatPct, model: model.code, ruleVersionId: model.ruleVersionId,
    };
    const response = await fetch("/api/calculations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: context.requestId,
        requestRoleId: selectedRoleId,
        modelId: model.id,
        ruleVersionId: model.ruleVersionId ?? undefined,
        name: scenarioName,
        inputs,
        costs,
        result,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setSaveState({ busy: false, message: json.error ?? "Не удалось сохранить сценарий", error: true }); return; }
    setSaveState({ busy: false, message: "Сценарий сохранён. Его можно отправить на согласование.", error: false });
    router.refresh();
  }

  const rateUnit = billingUnit === "mixed" ? variableBillingUnit : billingUnit;
  const rateSuffix = rateUnit === "hour" ? "/ч" : rateUnit === "shift" ? "/смену" : rateUnit === "unit" ? "/ед." : rateUnit === "worker_month" ? "/чел./мес" : rateUnit === "project_month" ? "/мес" : "/проект";

  return <div className="calc-layout"><section className="section">
    {context && <div className="commercial-calc-context"><label>Позиция заявки<select value={selectedRoleId} onChange={(event) => selectRole(event.target.value)}>{context.roles.map((role) => <option key={role.id} value={role.id}>{role.specialty} · {role.count} чел.</option>)}</select></label><label>Название сценария<input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} /></label></div>}

    <div className="scenario-tabs">{models.map((item) => <button key={item.id} type="button" className={model?.id === item.id ? "active" : ""} onClick={() => selectModel(item.id)}>{item.name}</button>)}</div>
    <div className="compliance-note"><AlertTriangle size={15} /><span>{model?.ruleVersionId ? `Используется версия правил №${model.ruleVersion ?? "—"}. ${model.ruleSource ?? ""}` : "Для выбранной модели нет действующей версии правил. Сценарий нельзя считать нормативно подтверждённым."}</span></div>

    <details className="calc-group" open><summary><span>Выплата сотруднику и объём</span><span>{rub(workerPayAmount)} / {workerPayUnit === "hour" ? "ч" : workerPayUnit === "shift" ? "смену" : "мес"}</span></summary>
      <div className="calc-row"><span>✓</span><span>Сотруднику на руки</span><input type="number" value={workerPayAmount} onChange={(event) => setWorkerPayAmount(Number(event.target.value))}/><select value={workerPayUnit} onChange={(event) => setWorkerPayUnit(event.target.value as WorkerPayUnit)}><option value="hour">₽/ч</option><option value="shift">₽/смену</option><option value="month">₽/мес</option></select></div>
      <CalcInput label="Количество сотрудников" value={workers} onChange={setWorkers} unit="чел." />
      <CalcInput label="Часов на сотрудника / месяц" value={hours} onChange={setHours} unit="ч" />
      <CalcInput label="Оплачиваемых часов / смену" value={shiftHours} onChange={setShiftHours} unit="ч" />
      <CalcInput label="Смен на сотрудника / месяц" value={shifts} onChange={setShifts} unit="смен" />
      <CalcInput label="Расчётный срок проекта" value={projectMonths} onChange={setProjectMonths} unit="мес" />
    </details>

    <details className="calc-group" open><summary><span>Тарификация клиента</span><span>{billingLabels[billingUnit]}</span></summary>
      <div className="calc-row"><span>✓</span><span>Способ расчёта цены</span><select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as PricingMode)}><option value="target_margin">От целевой маржи</option><option value="client_limit">От лимита клиента</option></select><span></span></div>
      <div className="calc-row"><span>✓</span><span>Единица расчёта</span><select value={billingUnit} onChange={(event) => setBillingUnit(event.target.value as BillingUnit)}>{Object.entries(billingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span></span></div>
      {billingUnit === "mixed" && <><div className="calc-row"><span>✓</span><span>Переменная единица</span><select value={variableBillingUnit} onChange={(event) => setVariableBillingUnit(event.target.value as "hour" | "shift" | "unit")}><option value="hour">час</option><option value="shift">смена</option><option value="unit">единица</option></select><span></span></div><CalcInput label="Фиксированная часть / месяц" value={fixedMonthlyNet} onChange={setFixedMonthlyNet} unit="₽" /></>}
      {(billingUnit === "unit" || (billingUnit === "mixed" && variableBillingUnit === "unit")) && <CalcInput label="Производительность / сотрудника / смену" value={unitsPerWorkerShift} onChange={setUnitsPerWorkerShift} unit="ед." />}
      {pricingMode === "target_margin" ? <CalcInput label="Целевая маржа" value={margin} onChange={setMargin} unit="%" /> : <><CalcInput label="Лимит клиента" value={clientLimit} onChange={setClientLimit} unit="₽" /><div className="calc-row"><span>✓</span><span>Лимит указан</span><select value={clientLimitVatMode} onChange={(event) => setClientLimitVatMode(event.target.value as "with_vat" | "without_vat")}><option value="without_vat">без НДС</option><option value="with_vat">с НДС</option></select><span></span></div></>}
      <CalcInput label="Минимальный гарантированный объём / месяц" value={minimumMonthlyNet} onChange={setMinimumMonthlyNet} unit="₽ без НДС" />
      <div className="calc-row"><span>✓</span><span>Режим НДС</span><select value={vatMode} onChange={(event) => setVatMode(event.target.value)}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select><span></span></div>
      {vatMode === "with_vat" && <CalcInput label="Ставка НДС из правил" value={vatPct} onChange={setVatPct} unit="%" />}
    </details>

    {groups.map((group) => {
      const items = costs.filter((cost) => cost.group === group);
      return <details className="calc-group" open key={group}><summary><span>{group}</span><span>{items.filter((item) => item.enabled).length} стат.</span></summary>{items.map((cost) => <div className="calc-row calc-row-full" key={cost.id}><input type="checkbox" checked={cost.enabled} onChange={(event) => update(cost.id, { enabled: event.target.checked })} aria-label={`Включить ${cost.label}`} /><input className="expense-name" value={cost.label} onChange={(event) => update(cost.id, { label: event.target.value })} /><input type="number" value={cost.amount} onChange={(event) => update(cost.id, { amount: Number(event.target.value) })} /><select value={cost.base} onChange={(event) => update(cost.id, { base: event.target.value as Base })}><option value="per_hour">₽/ч/сотрудник</option><option value="per_shift">₽/смену/сотрудник</option><option value="per_worker_month">₽/чел./мес</option><option value="project_month">₽/проект/мес</option><option value="project_fixed">₽/проект разово</option><option value="per_unit">₽/единицу</option></select><button type="button" onClick={() => duplicate(cost)} aria-label="Дублировать"><Copy size={14} /></button><button type="button" onClick={() => setCosts((value) => value.filter((item) => item.id !== cost.id))} aria-label="Удалить"><Trash2 size={14} /></button></div>)}<button type="button" className="add-expense" onClick={() => add(group)}><Plus size={14} /> Добавить статью</button></details>;
    })}
  </section><aside className="section calc-summary"><div className="calc-result">
    <div className="eyebrow">Сценарий · {model?.name ?? "Модель"}</div>
    <div className="big">{rub(result.clientRateNet)}<small> {rateSuffix} без НДС</small></div>
    {vatMode === "with_vat" && <div className="calc-kv"><span>Ставка с НДС</span><strong>{rub(result.clientRateGross)} {rateSuffix}</strong></div>}
    <div className="calc-kv"><span>Сотруднику на руки / месяц</span><strong>{rub(result.workerPayMonthly)}</strong></div>
    <div className="calc-kv"><span>Обязательные начисления / месяц</span><strong>{rub(result.mandatoryChargesMonthly)}</strong></div>
    <div className="calc-kv"><span>Дополнительные расходы / месяц</span><strong>{rub(result.additionalCostsMonthly)}</strong></div>
    <div className="calc-kv"><span>Себестоимость / час</span><strong>{rub(result.totalCostHourly)}</strong></div>
    <div className="calc-kv"><span>Точка безубыточности</span><strong>{rub(result.breakEvenRateNet)}</strong></div>
    <div className="calc-kv"><span>Фактическая маржа</span><strong>{pct(result.marginPct)}</strong></div>
    <div className="calc-kv"><span>Выручка без НДС / месяц</span><strong>{rub(result.monthlyRevenueNet)}</strong></div>
    <div className="calc-kv"><span>Прибыль / месяц</span><strong>{rub(result.monthlyContribution)}</strong></div>
    <div className="calc-kv"><span>Прибыль за расчётный срок</span><strong>{rub(result.projectContribution)}</strong></div>
    {result.warnings.length > 0 && <div className="compliance-panel"><strong>Проверить перед согласованием</strong>{result.warnings.map((warning: string) => <span key={warning}>{warningLabels[warning] ?? warning}</span>)}</div>}
    {context && <button className="button primary" style={{ width: "100%", marginTop: 16 }} type="button" onClick={saveScenario} disabled={saveState.busy}><Save size={14} />{saveState.busy ? " Сохранение…" : " Сохранить как новый сценарий"}</button>}
    <button className="button" style={{ width: "100%", marginTop: 8 }} type="button" onClick={exportSummary}><Download size={14} /> Экспортировать сводку</button>
    {saveState.message && <p className={saveState.error ? "form-error" : "form-success"}>{saveState.message}</p>}
    <p className="calc-disclaimer">Согласованный сценарий остаётся неизменяемой исторической версией. Новый пересчёт всегда сохраняется отдельным сценарием.</p>
  </div></aside></div>;
}

function CalcInput({ label, value, onChange, unit }: { label: string; value: number; onChange: (value: number) => void; unit: string }) {
  return <div className="calc-row"><span>✓</span><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{unit}</span></div>;
}
