"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Download, Plus, Save, Trash2 } from "lucide-react";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
import type { CalculationModelOption } from "@/lib/commercial/calculation-models";
import { pct, rub } from "@/lib/ui/format";

type Base = "per_hour" | "per_shift" | "per_worker_month" | "project_month" | "project_fixed" | "per_unit";
type CostScope = "worker" | "role" | "project";
type CostSource = "manual" | "request" | "rule";
type Cost = { id: string; group: string; label: string; amount: number; base: Base; enabled: boolean; scope: CostScope; source: CostSource };
type BillingUnit = "hour" | "shift" | "unit" | "worker_month" | "project_month" | "project_fixed" | "mixed";
type WorkerPayUnit = "hour" | "shift" | "month";
type PricingMode = "target_margin" | "client_limit";
type ContextRole = { id: string; specialty: string; count: number; schedule?: Record<string, unknown>; targetClientRate?: number | string | null };

type Context = {
  sourceType?: "request" | "tender";
  sourceId?: string;
  requestId?: string;
  sourceLabel?: string;
  roleLabel?: string;
  roles: ContextRole[];
  models: CalculationModelOption[];
  vatMode?: string | null;
  schedule?: Record<string, unknown>;
  projectWorkers?: number;
  economicsDate?: string | null;
};

const groups = [
  "Налоги и обязательные начисления",
  "Регулярное обеспечение",
  "Транспорт и проживание",
  "СИЗ и медицина",
  "Подбор и управление",
  "Прочие расходы",
];

// Production defaults deliberately contain no monetary assumptions. Values are
// entered by a user or later supplied by a company rule/reference source.
const initialCosts: Cost[] = [
  { id: "housing", group: groups[2], label: "Проживание", amount: 0, base: "per_shift", enabled: false, scope: "worker", source: "manual" },
  { id: "travel", group: groups[2], label: "Проезд и логистика", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "ppe", group: groups[3], label: "СИЗ и спецодежда", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "medical", group: groups[3], label: "Медицина", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "recruit", group: groups[4], label: "Подбор и запуск", amount: 0, base: "project_fixed", enabled: false, scope: "project", source: "manual" },
  { id: "manager", group: groups[4], label: "Управление объектом", amount: 0, base: "project_month", enabled: false, scope: "project", source: "manual" },
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

const warningLabels: Record<string, string> = {
  below_minimum_margin: "Маржа ниже минимального норматива компании",
  above_client_limit: "Расчётная ставка выше указанного лимита клиента",
  rules_unverified: "Активная версия правил помечена как непроверенная",
  rule_version_missing: "Для модели не найдена действующая версия правил",
};

const baseLabels: Record<Base, string> = {
  per_hour: "₽/ч/сотр.",
  per_shift: "₽/смену/сотр.",
  per_worker_month: "₽/сотр./мес.",
  project_month: "₽/проект/мес.",
  project_fixed: "₽/проект разово",
  per_unit: "₽/единицу",
};

const scopeLabels: Record<CostScope, string> = { worker: "Сотрудник", role: "Позиция", project: "Проект" };
const sourceLabels: Record<CostSource, string> = { manual: "Вручную", request: "Из заявки", rule: "Из норматива" };

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function displayDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU").format(date);
}

export function CalculatorWorkspaceOperis({ context }: { context?: Context }) {
  const router = useRouter();
  const models = context?.models?.length ? context.models : fallbackModels;
  const sourceType = context?.sourceType ?? "request";
  const sourceId = context?.sourceId ?? context?.requestId ?? "";
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((item) => item.id === modelId) ?? models[0];
  const [selectedRoleId, setSelectedRoleId] = useState(context?.roles[0]?.id ?? "");
  const selectedRole = context?.roles.find((role) => role.id === selectedRoleId);
  const roleSchedule = selectedRole?.schedule ?? context?.schedule ?? {};
  const initialPaidHours = num(roleSchedule.paidHours, 11);
  const initialHoursPerWorker = initialPaidHours * 22;
  const [scenarioName, setScenarioName] = useState("Базовый сценарий");
  const [saveState, setSaveState] = useState<{busy:boolean;message:string;error:boolean}>({busy:false,message:"",error:false});
  const [workerPayAmount, setWorkerPayAmount] = useState(0);
  const [workerPayUnit, setWorkerPayUnit] = useState<WorkerPayUnit>("hour");
  const [workers, setWorkers] = useState(selectedRole?.count ?? 1);
  const [hours, setHours] = useState(initialHoursPerWorker);
  const [shiftHours, setShiftHours] = useState(initialPaidHours);
  const [shifts, setShifts] = useState(22);
  const [projectMonths, setProjectMonths] = useState(1);
  const [pricingMode, setPricingMode] = useState<PricingMode>("target_margin");
  const [margin, setMargin] = useState(Number(model?.rules.recommendedMarginPct ?? 18));
  const [clientLimit, setClientLimit] = useState(Number(selectedRole?.targetClientRate ?? 0));
  const [clientLimitVatMode, setClientLimitVatMode] = useState<"with_vat"|"without_vat">(context?.vatMode === "with_vat" ? "with_vat" : "without_vat");
  const [billingUnit, setBillingUnit] = useState<BillingUnit>("hour");
  const [variableBillingUnit, setVariableBillingUnit] = useState<"hour"|"shift"|"unit">("hour");
  const [unitsPerWorkerShift, setUnitsPerWorkerShift] = useState(100);
  const [fixedMonthlyNet, setFixedMonthlyNet] = useState(0);
  const [minimumMonthlyNet, setMinimumMonthlyNet] = useState(0);
  const [vatMode, setVatMode] = useState(context?.vatMode ?? "with_vat");
  const [vatPct, setVatPct] = useState(Number(model?.rules.vatPct ?? 0));
  const [costs, setCosts] = useState<Cost[]>(initialCosts);

  const totalProjectWorkers = Math.max(1, context?.projectWorkers ?? workers);
  const projectAllocationShare = Math.min(1, Math.max(0, workers / totalProjectWorkers));

  const calculatedCosts = useMemo(() => costs.map((cost) => {
    const allocationShare = cost.scope === "project" ? projectAllocationShare : 1;
    return {
      ...cost,
      enteredAmount: cost.amount,
      allocationShare,
      amount: cost.amount * allocationShare,
    };
  }), [costs, projectAllocationShare]);

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
    costs: calculatedCosts,
  }), [workers, hours, shiftHours, shifts, projectMonths, workerPayAmount, workerPayUnit, pricingMode, margin, clientLimit, clientLimitVatMode, billingUnit, variableBillingUnit, unitsPerWorkerShift, fixedMonthlyNet, minimumMonthlyNet, vatMode, vatPct, model, calculatedCosts]);

  function updateCost(id: string, patch: Partial<Cost>) {
    setCosts((current) => current.map((cost) => cost.id === id ? { ...cost, ...patch } : cost));
  }

  function addCost(group: string) {
    setCosts((current) => [...current, { id: crypto.randomUUID(), group, label: "Новая статья", amount: 0, base: "per_hour", enabled: true, scope: "worker", source: "manual" }]);
  }

  function duplicateCost(cost: Cost) {
    setCosts((current) => [...current, { ...cost, id: crypto.randomUUID(), label: `${cost.label} — копия`, source: "manual" }]);
  }

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
    const lines: Array<Array<string|number>> = [
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
    const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8"}));
    link.download = "расчёт-сценария.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function saveScenario() {
    if (!context || !sourceId || !selectedRoleId || !model) return;
    setSaveState({busy:true,message:"",error:false});
    const inputs = {
      workerPayAmount,
      workerPayUnit,
      workers,
      hoursPerWorker: hours,
      shiftHours,
      shiftsPerWorker: shifts,
      projectMonths,
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
      model: model.code,
      ruleVersionId: model.ruleVersionId,
      economicsDate: context.economicsDate ?? null,
      projectWorkers: totalProjectWorkers,
      projectAllocationMode: "headcount",
      projectAllocationShare,
    };
    const response = await fetch("/api/calculations", {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({sourceType,sourceId,sourceRoleId:selectedRoleId,modelId:model.id,ruleVersionId:model.ruleVersionId??undefined,name:scenarioName,inputs,costs:calculatedCosts,result}),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveState({busy:false,message:json.error ?? "Не удалось сохранить сценарий",error:true});
      return;
    }
    setSaveState({busy:false,message:"Сценарий сохранён. Его можно отправить на согласование.",error:false});
    router.refresh();
  }

  const rateUnit = billingUnit === "mixed" ? variableBillingUnit : billingUnit;
  const rateSuffix = rateUnit === "hour" ? "/ч" : rateUnit === "shift" ? "/смену" : rateUnit === "unit" ? "/ед." : rateUnit === "worker_month" ? "/сотр./мес" : rateUnit === "project_month" ? "/мес" : "/проект";
  const economicsDate = displayDate(context?.economicsDate);

  return <div className="calc-layout">
    <section className="section">
      {context && <div className="commercial-calc-context">
        <label>{context.roleLabel ?? (sourceType === "tender" ? "Позиция тендера" : "Позиция заявки")}
          <select value={selectedRoleId} onChange={(event) => selectRole(event.target.value)}>{context.roles.map((role) => <option key={role.id} value={role.id}>{role.specialty} · {role.count} чел.</option>)}</select>
        </label>
        <label>Название сценария<input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)}/></label>
      </div>}

      <div className="scenario-tabs">{models.map((item) => <button key={item.id} type="button" className={model?.id === item.id ? "active" : ""} onClick={() => selectModel(item.id)}>{item.name}</button>)}</div>
      <div className="compliance-note"><AlertTriangle size={15}/><span>{model?.ruleVersionId
        ? `Правила №${model.ruleVersion ?? "—"}${economicsDate ? ` · дата экономики ${economicsDate}` : ""}. ${model.ruleSource ?? ""}`
        : "Для выбранной модели нет действующей версии правил. Сценарий нельзя считать нормативно подтверждённым."}</span></div>

      <details className="calc-group" open>
        <summary><span>Исходные условия и оплата</span><span>{workerPayAmount > 0 ? `${rub(workerPayAmount)} / ${workerPayUnit === "hour" ? "ч" : workerPayUnit === "shift" ? "смену" : "мес"}` : "Заполните ставку"}</span></summary>
        <div className="calc-row"><span>✓</span><span>Сотруднику на руки <small className="cell-sub">Вручную</small></span><input type="number" min="0" value={workerPayAmount} onChange={(event) => setWorkerPayAmount(Number(event.target.value))}/><select value={workerPayUnit} onChange={(event) => setWorkerPayUnit(event.target.value as WorkerPayUnit)}><option value="hour">₽/ч</option><option value="shift">₽/смену</option><option value="month">₽/мес</option></select></div>
        <CalcInput label="Количество сотрудников" note={context ? "Из позиции источника" : "Вручную"} value={workers} onChange={setWorkers} unit="чел."/>
        <CalcInput label="Часов на сотрудника / месяц" note={context ? "Из графика, можно скорректировать" : "Вручную"} value={hours} onChange={setHours} unit="ч"/>
        <CalcInput label="Оплачиваемых часов / смену" note={context ? "Из графика, можно скорректировать" : "Вручную"} value={shiftHours} onChange={setShiftHours} unit="ч"/>
        <CalcInput label="Смен на сотрудника / месяц" value={shifts} onChange={setShifts} unit="смен"/>
        <CalcInput label="Расчётный срок проекта" value={projectMonths} onChange={setProjectMonths} unit="мес"/>
      </details>

      <details className="calc-group" open>
        <summary><span>Тарификация клиента</span><span>{billingLabels[billingUnit]}</span></summary>
        <div className="calc-row"><span>✓</span><span>Способ расчёта цены</span><select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as PricingMode)}><option value="target_margin">От целевой маржи</option><option value="client_limit">От лимита клиента</option></select><span></span></div>
        <div className="calc-row"><span>✓</span><span>Единица расчёта</span><select value={billingUnit} onChange={(event) => setBillingUnit(event.target.value as BillingUnit)}>{Object.entries(billingLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><span></span></div>
        {billingUnit === "mixed" && <><div className="calc-row"><span>✓</span><span>Переменная единица</span><select value={variableBillingUnit} onChange={(event) => setVariableBillingUnit(event.target.value as "hour"|"shift"|"unit")}><option value="hour">час</option><option value="shift">смена</option><option value="unit">единица</option></select><span></span></div><CalcInput label="Фиксированная часть / месяц" value={fixedMonthlyNet} onChange={setFixedMonthlyNet} unit="₽"/></>}
        {(billingUnit === "unit" || (billingUnit === "mixed" && variableBillingUnit === "unit")) && <CalcInput label="Производительность / сотрудника / смену" value={unitsPerWorkerShift} onChange={setUnitsPerWorkerShift} unit="ед."/>}
        {pricingMode === "target_margin" ? <CalcInput label="Целевая маржа" note={model?.rules.recommendedMarginPct != null ? `Норматив рекомендует ${model.rules.recommendedMarginPct}%` : undefined} value={margin} onChange={setMargin} unit="%"/> : <><CalcInput label="Лимит клиента" note={selectedRole?.targetClientRate ? "Из позиции источника" : "Вручную"} value={clientLimit} onChange={setClientLimit} unit="₽"/><div className="calc-row"><span>✓</span><span>Лимит указан</span><select value={clientLimitVatMode} onChange={(event) => setClientLimitVatMode(event.target.value as "with_vat"|"without_vat")}><option value="without_vat">без НДС</option><option value="with_vat">с НДС</option></select><span></span></div></>}
        <CalcInput label="Минимальный гарантированный платёж / месяц" value={minimumMonthlyNet} onChange={setMinimumMonthlyNet} unit="₽ без НДС"/>
        <div className="calc-row"><span>✓</span><span>Режим НДС</span><select value={vatMode} onChange={(event) => setVatMode(event.target.value)}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select><span></span></div>
        {vatMode === "with_vat" && <CalcInput label="Ставка НДС из правил" note="Норматив модели" value={vatPct} onChange={setVatPct} unit="%"/>}
      </details>

      {groups.map((group) => {
        const items = costs.filter((cost) => cost.group === group);
        if (group === groups[0] && items.length === 0) return null;
        const active = items.filter((item) => item.enabled).length;
        return <details className="calc-group" key={group} open={active > 0}>
          <summary><span>{group}</span><span>{active ? `${active} включено` : "Не используется"}</span></summary>
          {items.map((cost) => <div className="calc-row" style={{gridTemplateColumns:"24px minmax(160px,1fr) 100px 132px 104px 30px 30px"}} key={cost.id}>
            <input type="checkbox" checked={cost.enabled} onChange={(event) => updateCost(cost.id,{enabled:event.target.checked})} aria-label={`Включить ${cost.label}`}/>
            <span><input style={{width:"100%"}} value={cost.label} onChange={(event) => updateCost(cost.id,{label:event.target.value})}/><small className="cell-sub">{sourceLabels[cost.source]}{cost.scope === "project" && context ? ` · распределяется ${pct(projectAllocationShare * 100)} на позицию` : ""}</small></span>
            <input type="number" min="0" value={cost.amount} onChange={(event) => updateCost(cost.id,{amount:Number(event.target.value)})}/>
            <select value={cost.base} onChange={(event) => updateCost(cost.id,{base:event.target.value as Base})}>{Object.entries(baseLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
            <select value={cost.scope} onChange={(event) => updateCost(cost.id,{scope:event.target.value as CostScope})}><option value="worker">Сотрудник</option><option value="role">Позиция</option><option value="project">Весь проект</option></select>
            <button type="button" onClick={() => duplicateCost(cost)} aria-label="Дублировать"><Copy size={14}/></button>
            <button type="button" onClick={() => setCosts((current) => current.filter((item) => item.id !== cost.id))} aria-label="Удалить"><Trash2 size={14}/></button>
          </div>)}
          <button type="button" className="add-expense" onClick={() => addCost(group)}><Plus size={14}/> Добавить статью</button>
        </details>;
      })}
    </section>

    <aside className="section calc-summary">
      <div className="calc-result">
        <div className="eyebrow">Экономика · {model?.name ?? "Модель"}</div>
        <div className="big">{rub(result.clientRateNet)}<small> {rateSuffix} без НДС</small></div>
        <div className="calc-kv"><span>Оплата персоналу / месяц</span><strong>{rub(result.workerPayMonthly)}</strong></div>
        <div className="calc-kv"><span>Обязательные начисления</span><strong>{rub(result.mandatoryChargesMonthly)}</strong></div>
        <div className="calc-kv"><span>Обеспечение и прочие расходы</span><strong>{rub(result.additionalCostsMonthly)}</strong></div>
        <div className="calc-kv"><span>Резерв</span><strong>{rub(result.reserveMonthly)}</strong></div>
        <div className="calc-kv"><span>Себестоимость / час</span><strong>{rub(result.totalCostHourly)}</strong></div>
        <div className="calc-kv"><span>Точка безубыточности</span><strong>{rub(result.breakEvenRateNet)} {rateSuffix}</strong></div>
        <div className="calc-kv"><span>Фактическая маржа</span><strong>{pct(result.marginPct)}</strong></div>
        <div className="calc-kv"><span>Цена без НДС</span><strong>{rub(result.clientRateNet)} {rateSuffix}</strong></div>
        {vatMode === "with_vat" && <><div className="calc-kv"><span>НДС на единицу</span><strong>{rub(result.clientVatAmount)}</strong></div><div className="calc-kv"><span>Цена клиенту с НДС</span><strong>{rub(result.clientRateGross)} {rateSuffix}</strong></div></>}
        <div className="calc-kv"><span>Выручка без НДС / месяц</span><strong>{rub(result.monthlyRevenueNet)}</strong></div>
        <div className="calc-kv"><span>Вклад / месяц</span><strong>{rub(result.monthlyContribution)}</strong></div>
        <div className="calc-kv"><span>Вклад за расчётный срок</span><strong>{rub(result.projectContribution)}</strong></div>
        {context && totalProjectWorkers > workers && <p className="calc-disclaimer">Общепроектные статьи распределяются по численности. На выбранную позицию приходится {pct(projectAllocationShare * 100)} ({workers} из {totalProjectWorkers} сотрудников).</p>}
        {result.warnings.length > 0 && <div className="compliance-panel"><strong>Проверить перед согласованием</strong>{result.warnings.map((warning:string) => <span key={warning}>{warningLabels[warning] ?? warning}</span>)}</div>}
        {context && <button className="button primary" style={{width:"100%",marginTop:16}} type="button" onClick={saveScenario} disabled={saveState.busy || workerPayAmount <= 0}><Save size={14}/>{saveState.busy ? " Сохранение…" : " Сохранить как новый сценарий"}</button>}
        {saveState.message && <p className={saveState.error ? "form-error" : "form-message"}>{saveState.message}</p>}
        <button className="button" style={{width:"100%",marginTop:8}} type="button" onClick={exportSummary}><Download size={14}/> Экспорт CSV</button>
        {!context && <p className="calc-disclaimer">Режим моделирования не сохраняет результат в коммерческий процесс. Для рабочего сценария откройте расчёт из заявки или тендера.</p>}
      </div>
    </aside>
  </div>;
}

function CalcInput({label,note,value,onChange,unit}:{label:string;note?:string;value:number;onChange:(value:number)=>void;unit:string}) {
  return <div className="calc-row"><span>✓</span><span>{label}{note && <small className="cell-sub">{note}</small>}</span><input type="number" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))}/><span>{unit}</span></div>;
}
