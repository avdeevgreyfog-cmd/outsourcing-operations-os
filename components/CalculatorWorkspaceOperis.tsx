"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Copy, Download, Plus, Save, Trash2 } from "lucide-react";
import { calculateCommercialScenario } from "@/lib/core/calculator.mjs";
import type { CalculationModelOption } from "@/lib/commercial/calculation-models";
import type { ExpenseStandard, ScheduleStandard } from "@/lib/commercial/calculation-standards";
import type { RateReference } from "@/lib/commercial/calculation-workspace";
import { pct, rub } from "@/lib/ui/format";

type Base = "per_hour" | "per_shift" | "per_worker_month" | "per_worker_period" | "percent_of_worker_pay" | "role_month" | "role_fixed" | "project_month" | "project_fixed" | "per_unit";
type CostScope = "worker" | "role" | "project";
type CostSource = "manual" | "request" | "rule" | "reference";
type Cost = { id: string; group: string; label: string; amount: number; base: Base; enabled: boolean; scope: CostScope; source: CostSource; amortizationMonths?:number|null; standardId?:string; standardVersion?:number };
type BillingUnit = "hour" | "shift" | "unit" | "worker_month" | "project_month" | "project_fixed" | "mixed";
type WorkerPayUnit = "hour" | "shift" | "month" | "unit";
type PricingMode = "target_margin" | "target_profit" | "client_limit";
type AllocationMode = "headcount" | "labor_hours";
type ContextRole = {
  id: string;
  specialtyId?: string | null;
  specialty: string;
  count: number;
  schedule?: Record<string, unknown>;
  targetClientRate?: number | string | null;
  reference?: RateReference | null;
};

type ScenarioSeed = {
  id: string;
  sourceRoleId: string;
  modelId: string;
  name: string;
  inputs: Record<string, unknown>;
  costs: Array<Record<string, unknown>>;
};

type Context = {
  calculationId?: string;
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
  allocationMode?: AllocationMode;
  projectCosts?: Array<Record<string, unknown>>;
  expenseStandards?: ExpenseStandard[];
  scheduleStandards?: ScheduleStandard[];
};

const groups = [
  "Регулярное обеспечение",
  "Периодические и разовые расходы",
  "Подбор и ротация",
  "Управление объектом",
  "Прочие расходы",
];

const initialCosts: Cost[] = [
  { id: "housing", group: groups[0], label: "Проживание", amount: 0, base: "per_shift", enabled: false, scope: "worker", source: "manual" },
  { id: "travel", group: groups[0], label: "Проезд и логистика", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "ppe", group: groups[1], label: "СИЗ и спецодежда", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "medical", group: groups[1], label: "Медицина", amount: 0, base: "per_worker_month", enabled: false, scope: "worker", source: "manual" },
  { id: "recruit", group: groups[2], label: "Подбор и запуск", amount: 0, base: "project_fixed", enabled: false, scope: "project", source: "manual" },
  { id: "manager", group: groups[3], label: "Управление объектом", amount: 0, base: "project_month", enabled: false, scope: "project", source: "manual" },
];

const fallbackModels: CalculationModelOption[] = [
  { id: "standalone-employment", name: "Трудовой договор", code: "employment", ruleVersionId: null, ruleVersion: null, ruleSource: null, ruleEffectiveFrom: null, ruleEffectiveTo: null, rules: {} },
  { id: "standalone-gph", name: "ГПХ", code: "gph", ruleVersionId: null, ruleVersion: null, ruleSource: null, ruleEffectiveFrom: null, ruleEffectiveTo: null, rules: {} },
  { id: "standalone-npd", name: "НПД / самозанятый", code: "npd", ruleVersionId: null, ruleVersion: null, ruleSource: null, ruleEffectiveFrom: null, ruleEffectiveTo: null, rules: {} },
  { id: "standalone-custom", name: "Модель компании", code: "custom", ruleVersionId: null, ruleVersion: null, ruleSource: null, ruleEffectiveFrom: null, ruleEffectiveTo: null, rules: {} },
];

const billingLabels: Record<BillingUnit, string> = {
  hour: "₽ / час",
  shift: "₽ / смена",
  unit: "₽ / объём",
  worker_month: "₽ / сотрудник / месяц",
  project_month: "₽ / проект / месяц",
  project_fixed: "Фикс за проект",
  mixed: "Фикс + переменная часть",
};
const volumeUnits = [
  {code:"unit",label:"единица"},{code:"order",label:"заказ"},{code:"pallet",label:"палета"},{code:"box",label:"короб"},{code:"kg",label:"кг"},{code:"m2",label:"м²"},{code:"custom",label:"своя единица"},
] as const;
const warningLabels: Record<string, string> = {
  below_minimum_margin: "Маржа ниже минимального норматива компании",
  above_client_limit: "Расчётная ставка выше указанного лимита клиента",
  rules_unverified: "Активная версия правил помечена как непроверенная",
  rule_version_missing: "Для модели не найдена действующая версия правил",
};
const baseLabels: Record<Base, string> = {
  per_hour: "₽/ч/сотр.",per_shift: "₽/смену/сотр.",per_worker_month: "₽/сотр./мес.",per_worker_period:"на сотр. / период",percent_of_worker_pay:"% выплаты",role_month:"₽/позицию/мес.",role_fixed:"₽/позицию разово",project_month: "₽/проект/мес.",project_fixed:"₽/проект разово",per_unit: "₽/единицу",
};
const scopeLabels: Record<CostScope, string> = { worker: "Сотрудник", role: "Позиция", project: "Проект" };
const sourceLabels: Record<CostSource, string> = { manual: "Вручную", request: "Из заявки", rule: "Из норматива", reference:"Из базы" };

function positive(value: unknown, fallback: number) { const n=Number(value);return Number.isFinite(n)&&n>0?n:fallback; }
function nonNegative(value: unknown, fallback=0) { const n=Number(value);return Number.isFinite(n)&&n>=0?n:fallback; }
function str(value: unknown, fallback="") { return typeof value==="string"?value:fallback; }
function payUnit(value: unknown):WorkerPayUnit { return value==="shift"||value==="month"||value==="unit"?value:"hour"; }
function pricing(value: unknown):PricingMode { return value==="client_limit"||value==="target_profit"?value:"target_margin"; }
function billing(value: unknown):BillingUnit { return ["hour","shift","unit","worker_month","project_month","project_fixed","mixed"].includes(String(value))?value as BillingUnit:"hour"; }
function displayDate(value?: string | null) { if(!value)return null;const date=new Date(`${value}T00:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ru-RU").format(date); }

function normalizeCost(raw:Record<string,unknown>):Cost|null {
  const id=str(raw.id);const label=str(raw.label);if(!id||!label)return null;
  const rawScope=str(raw.scope,"worker");const scope:CostScope=rawScope==="project"||rawScope==="role"?rawScope:"worker";
  const rawSource=str(raw.source,"manual");const source:CostSource=["request","rule","reference"].includes(rawSource)?rawSource as CostSource:"manual";
  const rawBase=str(raw.base,"per_hour");const allowed=Object.keys(baseLabels);const base:Base=allowed.includes(rawBase)?rawBase as Base:(scope==="project"?"project_month":scope==="role"?"role_month":"per_hour");
  const amount=scope==="project"?nonNegative(raw.enteredAmount,nonNegative(raw.amount)):nonNegative(raw.amount);
  return {id,group:str(raw.group,groups[4]),label,amount,base,enabled:raw.enabled!==false,scope,source,amortizationMonths:raw.amortizationMonths==null?null:nonNegative(raw.amortizationMonths),standardId:str(raw.standardId)||undefined,standardVersion:raw.standardVersion==null?undefined:nonNegative(raw.standardVersion)};
}

function buildInitialCosts(projectCosts?:Array<Record<string,unknown>>,seedCosts?:Array<Record<string,unknown>>,standards?:ExpenseStandard[]) {
  const map=new Map((standards?.length ? [] : initialCosts).map(item=>[item.id,{...item}]));
  for(const standard of standards??[])map.set(standard.id,{id:standard.id,standardId:standard.id,standardVersion:standard.version,group:standard.groupName||groups[4],label:standard.name,amount:standard.amount,base:standard.base,enabled:standard.defaultEnabled,scope:standard.scope,source:"rule",amortizationMonths:standard.amortizationMonths});
  for(const raw of seedCosts??[]){const cost=normalizeCost(raw);if(cost)map.set(cost.id,cost);}
  for(const raw of projectCosts??[]){const cost=normalizeCost({...raw,scope:"project"});if(cost)map.set(cost.id,cost);}
  return [...map.values()];
}

function basesForScope(scope:CostScope):Base[] {
  if(scope==="project")return ["project_month","project_fixed"];
  if(scope==="role")return ["role_month","role_fixed"];
  return ["per_hour","per_shift","per_worker_month","per_worker_period","percent_of_worker_pay","per_unit"];
}

export function CalculatorWorkspaceOperis({ context, seed, models: standaloneModels }: { context?: Context; seed?: ScenarioSeed | null; models?: CalculationModelOption[] }) {
  const router = useRouter();
  const models = context?.models?.length ? context.models : standaloneModels?.length ? standaloneModels : fallbackModels;
  const sourceType = context?.sourceType ?? "request";
  const sourceId = context?.sourceId ?? context?.requestId ?? "";
  const seedInputs=seed?.inputs??{};
  const initialModelId=models.some(item=>item.id===seed?.modelId)?seed!.modelId:models[0]?.id??"";
  const [modelId, setModelId] = useState(initialModelId);
  const model = models.find((item) => item.id === modelId) ?? models[0];
  const initialRoleId=context?.roles.some(role=>role.id===seed?.sourceRoleId)?seed!.sourceRoleId:context?.roles[0]?.id??"";
  const [selectedRoleId, setSelectedRoleId] = useState(initialRoleId);
  const selectedRole = context?.roles.find((role) => role.id === selectedRoleId);
  const roleSchedule = selectedRole?.schedule ?? context?.schedule ?? {};
  const initialPaidHours = positive(seedInputs.shiftHours,positive(roleSchedule.paidHours,11));
  const initialShifts=positive(seedInputs.shiftsPerWorker,22);
  const [scenarioName, setScenarioName] = useState(seed?`${seed.name} · новая версия`:"Базовый сценарий");
  const [saveState, setSaveState] = useState<{busy:boolean;message:string;error:boolean}>({busy:false,message:"",error:false});
  const [editorTab, setEditorTab] = useState<"inputs"|"structure">("inputs");
  const [expandedRateGroups, setExpandedRateGroups] = useState<Set<string>>(() => new Set(["pay","charges"]));
  const [workerPayAmount, setWorkerPayAmount] = useState(nonNegative(seedInputs.workerPayAmount,0));
  const [workerPayUnit, setWorkerPayUnit] = useState<WorkerPayUnit>(payUnit(seedInputs.workerPayUnit));
  const [workers, setWorkers] = useState(positive(seedInputs.workers,selectedRole?.count??1));
  const [hours, setHours] = useState(positive(seedInputs.hoursPerWorker,initialPaidHours*initialShifts));
  const [shiftHours, setShiftHours] = useState(initialPaidHours);
  const [shifts, setShifts] = useState(initialShifts);
  const [scheduleStandardId,setScheduleStandardId]=useState("");
  const [projectMonths, setProjectMonths] = useState(positive(seedInputs.projectMonths,1));
  const [pricingMode, setPricingMode] = useState<PricingMode>(pricing(seedInputs.pricingMode));
  const [margin, setMargin] = useState(nonNegative(seedInputs.targetMarginPct,Number(model?.rules.recommendedMarginPct ?? 18)));
  const [targetContribution, setTargetContribution] = useState(nonNegative(seedInputs.targetMonthlyContribution,0));
  const [clientLimit, setClientLimit] = useState(nonNegative(seedInputs.clientLimit,Number(selectedRole?.targetClientRate ?? 0)));
  const [clientLimitVatMode, setClientLimitVatMode] = useState<"with_vat"|"without_vat">(seedInputs.clientLimitVatMode==="with_vat"||(!seed&&context?.vatMode==="with_vat")?"with_vat":"without_vat");
  const [billingUnit, setBillingUnit] = useState<BillingUnit>(billing(seedInputs.billingUnit));
  const [volumeUnitCode,setVolumeUnitCode]=useState(str(seedInputs.billingUnitCode,"unit"));
  const [customVolumeLabel,setCustomVolumeLabel]=useState(str(seedInputs.billingUnitLabel,"единица"));
  const [variableBillingUnit, setVariableBillingUnit] = useState<"hour"|"shift"|"unit">(seedInputs.variableBillingUnit==="shift"||seedInputs.variableBillingUnit==="unit"?seedInputs.variableBillingUnit:"hour");
  const [unitsPerWorkerShift, setUnitsPerWorkerShift] = useState(positive(seedInputs.unitsPerWorkerShift,100));
  const [fixedMonthlyNet, setFixedMonthlyNet] = useState(nonNegative(seedInputs.fixedMonthlyNet,0));
  const [minimumMonthlyNet, setMinimumMonthlyNet] = useState(nonNegative(seedInputs.minimumMonthlyNet,0));
  const [minimumVolumeMonthly,setMinimumVolumeMonthly]=useState(nonNegative(seedInputs.minimumVolumeMonthly,0));
  const [vatMode, setVatMode] = useState(str(seedInputs.vatMode,context?.vatMode ?? "with_vat"));
  const [vatPct, setVatPct] = useState(nonNegative(seedInputs.vatPct,Number(model?.rules.vatPct ?? 0)));
  const [allocationMode,setAllocationMode]=useState<AllocationMode>(context?.allocationMode??(seedInputs.projectAllocationMode==="labor_hours"?"labor_hours":"headcount"));
  const [costs, setCosts] = useState<Cost[]>(()=>buildInitialCosts(context?.projectCosts,seed?.costs,context?.expenseStandards));

  const totalProjectWorkers = Math.max(1, context?.projectWorkers ?? context?.roles.reduce((sum,role)=>sum+role.count,0) ?? workers);
  const totalProjectLaborHours = useMemo(()=>{
    if(!context)return workers*hours;
    return context.roles.reduce((sum,role)=>{
      if(role.id===selectedRoleId)return sum+workers*hours;
      const paid=positive(role.schedule?.paidHours ?? context.schedule?.paidHours,11);
      return sum+Math.max(1,role.count)*paid*shifts;
    },0);
  },[context,selectedRoleId,workers,hours,shifts]);
  const projectAllocationShare = context
    ? allocationMode==="labor_hours"
      ? Math.min(1,Math.max(0,(workers*hours)/Math.max(1,totalProjectLaborHours)))
      : Math.min(1,Math.max(0,workers/Math.max(1,totalProjectWorkers)))
    : 1;

  const calculatedCosts = useMemo(() => costs.map((cost) => {
    const allocationShare = cost.scope === "project" ? projectAllocationShare : 1;
    return {...cost,enteredAmount:cost.amount,allocationShare,amount:cost.amount*allocationShare};
  }), [costs, projectAllocationShare]);

  const unitLabel=volumeUnitCode==="custom"?customVolumeLabel:(volumeUnits.find(item=>item.code===volumeUnitCode)?.label??"единица");
  const result = useMemo(() => calculateCommercialScenario({
    workers,hoursPerWorker:hours,hoursPerShift:shiftHours,shiftsPerWorker:shifts,projectMonths,workerPayAmount,workerPayUnit,pricingMode,
    targetMarginPct:margin,targetMonthlyContribution:targetContribution,targetProfitPerBillingUnit:targetContribution,clientLimit:clientLimit||null,clientLimitVatMode,billingUnit,variableBillingUnit,
    billingUnitCode:billingUnit==="unit"?volumeUnitCode:null,billingUnitLabel:billingUnit==="unit"?unitLabel:null,unitsPerWorkerShift,fixedMonthlyNet,minimumMonthlyNet,minimumVolumeMonthly,
    vatMode,vatPct,roundingStep:model?.rules.roundingStep,rules:model?.rules??{},ruleVersionId:model?.ruleVersionId??null,costs:calculatedCosts,
  }), [workers,hours,shiftHours,shifts,projectMonths,workerPayAmount,workerPayUnit,pricingMode,margin,targetContribution,clientLimit,clientLimitVatMode,billingUnit,variableBillingUnit,volumeUnitCode,unitLabel,unitsPerWorkerShift,fixedMonthlyNet,minimumMonthlyNet,minimumVolumeMonthly,vatMode,vatPct,model,calculatedCosts]);

  function updateCost(id:string,patch:Partial<Cost>){setCosts(current=>current.map(cost=>cost.id===id?{...cost,...patch}:cost));}
  function setCostScope(cost:Cost,scope:CostScope){const allowed=basesForScope(scope);updateCost(cost.id,{scope,base:allowed.includes(cost.base)?cost.base:allowed[0]});}
  function addCost(group:string){setCosts(current=>[...current,{id:crypto.randomUUID(),group,label:"Новая статья",amount:0,base:"per_hour",enabled:true,scope:"worker",source:"manual"}]);}
  function duplicateCost(cost:Cost){setCosts(current=>[...current,{...cost,id:crypto.randomUUID(),label:`${cost.label} — копия`,source:"manual"}]);}

  function selectModel(nextId:string){setModelId(nextId);const next=models.find(item=>item.id===nextId);if(next){setMargin(Number(next.rules.recommendedMarginPct??margin));setVatPct(Number(next.rules.vatPct??vatPct));}}
  function selectRole(nextId:string){setSelectedRoleId(nextId);const role=context?.roles.find(item=>item.id===nextId);if(!role)return;setWorkers(role.count);const paid=positive(role.schedule?.paidHours??context?.schedule?.paidHours,shiftHours);setShiftHours(paid);setHours(paid*shifts);setClientLimit(Number(role.targetClientRate??0));}
  function selectScheduleStandard(nextId:string){setScheduleStandardId(nextId);const standard=context?.scheduleStandards?.find(item=>item.id===nextId);if(!standard)return;const paid=Math.max(0.1,standard.shiftHours-(standard.breakPaid?0:standard.breakHours));setShiftHours(paid);setShifts(standard.shiftsPerMonth);setHours(paid*standard.shiftsPerMonth);}

  function applyReference(reference:RateReference,amount:number){
    if(reference.paySemantics!=="net")return;
    if(reference.unit==="shift")setWorkerPayUnit("shift");else if(reference.unit==="month")setWorkerPayUnit("month");else setWorkerPayUnit("hour");
    setWorkerPayAmount(amount);
  }

  function monthlyCostPreview(cost:Cost){
    if(!cost.enabled)return 0;
    const amount=cost.scope==="project"?cost.amount*projectAllocationShare:cost.amount;
    if(cost.base==="per_shift")return amount*shifts*workers;
    if(cost.base==="per_worker_month")return amount*workers;
    if(cost.base==="per_worker_period")return amount*workers/Math.max(1,cost.amortizationMonths??1);
    if(cost.base==="percent_of_worker_pay")return result.workerPayMonthly*amount/100;
    if(cost.base==="role_month"||cost.base==="project_month")return amount;
    if(cost.base==="role_fixed"||cost.base==="project_fixed")return amount/Math.max(1,projectMonths);
    if(cost.base==="per_unit")return amount*unitsPerWorkerShift*shifts*workers;
    return amount*hours*workers;
  }

  function exportSummary(){
    const lines:Array<Array<string|number>>=[
      ["Показатель","Значение"],["Модель",model?.name??"—"],["Версия правил",model?.ruleVersion??"—"],["Дата экономики",context?.economicsDate??"—"],
      ["Способ цены",pricingMode==="target_margin"?"От целевой маржи":pricingMode==="target_profit"?"От целевой прибыли":"От лимита клиента"],
      ["Единица тарификации",billingUnit==="unit"?`₽ / ${unitLabel}`:billingLabels[billingUnit]],["Себестоимость / час",result.totalCostHourly],
      ["Ставка клиенту без НДС",result.clientRateNet],["Ставка клиенту с НДС",result.clientRateGross],["Маржа, %",result.marginPct],
      ["Гарантированный объём / месяц",result.guaranteedBillableVolumeMonthly],["Минимальный платёж / месяц",result.minimumMonthlyNet],
      ["Выручка без НДС / месяц",result.monthlyRevenueNet],["Прибыль / месяц",result.monthlyContribution],
    ];
    const csv=lines.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));link.download="расчёт-сценария.csv";link.click();URL.revokeObjectURL(link.href);
  }

  async function saveScenario(){
    if(!context||!sourceId||!selectedRoleId||!model)return;setSaveState({busy:true,message:"",error:false});
    const inputs={workerPayAmount,workerPayUnit,workers,hoursPerWorker:hours,shiftHours,shiftsPerWorker:shifts,projectMonths,pricingMode,targetMarginPct:margin,targetMonthlyContribution:targetContribution,
      clientLimit:clientLimit||null,clientLimitVatMode,billingUnit,variableBillingUnit,billingUnitCode:billingUnit==="unit"?volumeUnitCode:null,billingUnitLabel:billingUnit==="unit"?unitLabel:null,
      unitsPerWorkerShift,fixedMonthlyNet,minimumMonthlyNet,minimumVolumeMonthly,vatMode,vatPct,model:model.code,ruleVersionId:model.ruleVersionId,economicsDate:context.economicsDate??null,
      projectWorkers:totalProjectWorkers,projectAllocationMode:allocationMode,projectAllocationShare};
    const response=await fetch("/api/calculations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({calculationId:context.calculationId,sourceType,sourceId,sourceRoleId:selectedRoleId,modelId:model.id,ruleVersionId:model.ruleVersionId??undefined,supersedesScenarioId:seed?.id,allocationMode,name:scenarioName,inputs,costs:calculatedCosts,result})});
    const json=await response.json().catch(()=>({}));if(!response.ok){setSaveState({busy:false,message:json.error??"Не удалось сохранить сценарий",error:true});return;}
    setSaveState({busy:false,message:`Сценарий v${json.scenarioVersion??""} сохранён.`,error:false});
    if(json.calculationId)router.push(`/calculations/${json.calculationId}`);else router.refresh();
  }

  const rateUnit=billingUnit==="mixed"?variableBillingUnit:billingUnit;
  const rateSuffix=rateUnit==="hour"?"/ч":rateUnit==="shift"?"/смену":rateUnit==="unit"?`/${unitLabel}`:rateUnit==="worker_month"?"/сотр./мес":rateUnit==="project_month"?"/мес":"/проект";
  const economicsDate=displayDate(context?.economicsDate);
  const reference=selectedRole?.reference??null;

  const monthlyHours = Math.max(1, hours * workers);
  const monthlyShifts = Math.max(1, shifts * workers);
  const rateRow = (label:string, monthly:number, note?:string) => ({ label, monthly, note });
  const expenseGroups = groups.map((group) => ({
    id: `expense:${group}`,
    title: group,
    rows: costs.filter((cost) => cost.group === group && cost.enabled).map((cost) => rateRow(cost.label, monthlyCostPreview(cost), `${sourceLabels[cost.source]} · ${baseLabels[cost.base]}`)),
  })).filter((group) => group.rows.length > 0);
  const rateGroups = [
    { id: "pay", title: "Выплата сотруднику", rows: [rateRow("Сотруднику на руки", result.workerPayMonthly, `Выплата ${workerPayUnit === "hour" ? "за час" : workerPayUnit === "shift" ? "за смену" : workerPayUnit === "unit" ? `за ${unitLabel}` : "за месяц"}`)] },
    { id: "charges", title: "Налоги, взносы и комиссии", rows: [rateRow("Начисления по выбранной модели", result.mandatoryChargesMonthly, model?.ruleVersionId ? `Правила №${model.ruleVersion ?? "—"}` : "Версия правил не выбрана")] },
    ...expenseGroups,
    { id: "reserve", title: "Резерв и прочие расходы", rows: [rateRow("Резерв рисков", result.reserveMonthly, `${model?.rules.riskReservePct ?? 0}% от полной стоимости`)] },
  ];
  const toggleRateGroup = (id:string) => setExpandedRateGroups((current) => { const next = new Set(current); if(next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div className="calc-layout calc-operis">
    <div className="calc-editor">
      <div className="calc-workspace-tabs" role="tablist" aria-label="Экран расчёта">
        <button type="button" className={editorTab === "inputs" ? "active" : ""} role="tab" aria-selected={editorTab === "inputs"} onClick={() => setEditorTab("inputs")}>Исходные данные<small>Зарплата, график и тарификация</small></button>
        <button type="button" className={editorTab === "structure" ? "active" : ""} role="tab" aria-selected={editorTab === "structure"} onClick={() => setEditorTab("structure")}>Структура ставки<small>Единая сводка расходов</small></button>
      </div>
      {editorTab === "inputs" && <>
      {context&&<div className="commercial-calc-context">
        <label>{context.roleLabel??(sourceType==="tender"?"Позиция тендера":"Позиция заявки")}<select value={selectedRoleId} onChange={event=>selectRole(event.target.value)}>{context.roles.map(role=><option key={role.id} value={role.id}>{role.specialty} · {role.count} чел.</option>)}</select></label>
        <label>Название сценария<input value={scenarioName} onChange={event=>setScenarioName(event.target.value)}/></label>
        {context.roles.length>1&&<label>Распределение общих расходов<select value={allocationMode} onChange={event=>setAllocationMode(event.target.value as AllocationMode)}><option value="headcount">По численности</option><option value="labor_hours">По трудочасам</option></select></label>}
      </div>}

      <div className="scenario-tabs" role="tablist" aria-label="Модель оформления">{models.map(item=><button key={item.id} type="button" role="tab" aria-selected={model?.id===item.id} className={model?.id===item.id?"active":""} onClick={()=>selectModel(item.id)}>{item.name}</button>)}</div>
      <div className="compliance-note"><AlertTriangle size={15}/><span>{model?.ruleVersionId
        ? `Правила №${model.ruleVersion??"—"}${economicsDate?` на ${economicsDate}`:""}. ${model.ruleSource??""}`
        : "Для выбранной модели нет действующей версии правил. Результат можно использовать только как предварительное моделирование."}</span></div>
      <div className="calc-rule-strip">
        <span>Начисления <strong>{model?.rules.mandatoryChargePct!=null?`${model.rules.mandatoryChargePct}%`:"—"}</strong></span>
        <span>Резерв <strong>{model?.rules.riskReservePct!=null?`${model.rules.riskReservePct}%`:"—"}</strong></span>
        <span>Мин. маржа <strong>{model?.rules.minimumMarginPct!=null?`${model.rules.minimumMarginPct}%`:"—"}</strong></span>
        <span>Рекомендуемая <strong>{model?.rules.recommendedMarginPct!=null?`${model.rules.recommendedMarginPct}%`:"—"}</strong></span>
      </div>

      <details className="calc-group" open>
        <summary><span>Исходные условия и оплата</span><span>{workerPayAmount>0?`${rub(workerPayAmount)} / ${workerPayUnit==="hour"?"ч":workerPayUnit==="shift"?"смену":workerPayUnit==="unit"?unitLabel:"мес"}`:"Заполните ставку"}</span></summary>
        {reference&&<div className="calc-reference"><div><span>Ориентир базы ставок</span><strong>{rub(reference.amountMin)}{reference.amountMax!=null?` – ${rub(reference.amountMax)}`:""} / {reference.unit}</strong><small>{reference.source} · {displayDate(reference.sourceDate)??reference.sourceDate} · {reference.paySemantics==="net"?"на руки":"брутто"}</small></div>{reference.paySemantics==="net"&&<div><button type="button" className="button" onClick={()=>applyReference(reference,reference.amountMin)}>Подставить минимум</button>{reference.amountMax!=null&&<button type="button" className="button" onClick={()=>applyReference(reference,(reference.amountMin+reference.amountMax)/2)}>Подставить середину</button>}</div>}</div>}
        <div className="calc-row"><span className="calc-row-check">✓</span><span>Сотруднику на руки<small>Вручную</small></span><input type="number" min="0" value={workerPayAmount} onChange={event=>setWorkerPayAmount(Number(event.target.value))}/><select value={workerPayUnit} onChange={event=>setWorkerPayUnit(event.target.value as WorkerPayUnit)}><option value="hour">₽/ч</option><option value="shift">₽/смену</option><option value="month">₽/мес</option><option value="unit">₽/ед.</option></select></div>
        <CalcInput label="Количество сотрудников" note={context?"Из позиции источника":"Вручную"} value={workers} onChange={setWorkers} unit="чел."/>
        {context?.scheduleStandards?.length&&<div className="calc-row"><span className="calc-row-check">✓</span><span>Шаблон графика<small>Подставляет оплачиваемые часы и смены</small></span><select value={scheduleStandardId} onChange={event=>selectScheduleStandard(event.target.value)}><option value="">Из источника / вручную</option>{context.scheduleStandards.map(item=><option key={item.id} value={item.id}>{item.name} · {item.shiftsPerMonth} смен.</option>)}</select><span/></div>}
        <CalcInput label="Часов на сотрудника / месяц" note={context?"Из графика, можно скорректировать":"Вручную"} value={hours} onChange={setHours} unit="ч"/>
        <CalcInput label="Оплачиваемых часов / смену" note={context?"Из графика, можно скорректировать":"Вручную"} value={shiftHours} onChange={setShiftHours} unit="ч"/>
        <CalcInput label="Смен на сотрудника / месяц" value={shifts} onChange={setShifts} unit="смен"/>
        <CalcInput label="Расчётный срок проекта" value={projectMonths} onChange={setProjectMonths} unit="мес"/>
      </details>

      <details className="calc-group" open>
        <summary><span>Тарификация клиента</span><span>{billingUnit==="unit"?`₽ / ${unitLabel}`:billingLabels[billingUnit]}</span></summary>
        <div className="calc-row"><span className="calc-row-check">✓</span><span>Способ расчёта цены</span><select value={pricingMode} onChange={event=>setPricingMode(event.target.value as PricingMode)}><option value="target_margin">От целевой маржи</option><option value="target_profit">От целевой прибыли</option><option value="client_limit">От лимита клиента</option></select><span/></div>
        <div className="calc-row"><span className="calc-row-check">✓</span><span>Единица расчёта</span><select value={billingUnit} onChange={event=>setBillingUnit(event.target.value as BillingUnit)}>{Object.entries(billingLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><span/></div>
        {billingUnit==="unit"&&<div className="calc-row"><span className="calc-row-check">✓</span><span>Единица объёма</span><select value={volumeUnitCode} onChange={event=>setVolumeUnitCode(event.target.value)}>{volumeUnits.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select>{volumeUnitCode==="custom"?<input value={customVolumeLabel} onChange={event=>setCustomVolumeLabel(event.target.value)} aria-label="Название единицы объёма"/>:<span/>}</div>}
        {billingUnit==="mixed"&&<><div className="calc-row"><span className="calc-row-check">✓</span><span>Переменная единица</span><select value={variableBillingUnit} onChange={event=>setVariableBillingUnit(event.target.value as "hour"|"shift"|"unit")}><option value="hour">час</option><option value="shift">смена</option><option value="unit">объём</option></select><span/></div><CalcInput label="Фиксированная часть / месяц" value={fixedMonthlyNet} onChange={setFixedMonthlyNet} unit="₽"/></>}
        {(billingUnit==="unit"||(billingUnit==="mixed"&&variableBillingUnit==="unit"))&&<CalcInput label={`Производительность / сотрудника / смену`} value={unitsPerWorkerShift} onChange={setUnitsPerWorkerShift} unit={unitLabel}/>} 
        {pricingMode==="target_margin"?<CalcInput label="Целевая маржа" note={model?.rules.recommendedMarginPct!=null?`Норматив рекомендует ${model.rules.recommendedMarginPct}%`:undefined} value={margin} onChange={setMargin} unit="%"/>:pricingMode==="target_profit"?<CalcInput label="Целевая прибыль на расчётную единицу" note={`На ${rateSuffix}`} value={targetContribution} onChange={setTargetContribution} unit="₽"/>:<><CalcInput label="Лимит клиента" note={selectedRole?.targetClientRate?"Из позиции источника":"Вручную"} value={clientLimit} onChange={setClientLimit} unit="₽"/><div className="calc-row"><span className="calc-row-check">✓</span><span>Лимит указан</span><select value={clientLimitVatMode} onChange={event=>setClientLimitVatMode(event.target.value as "with_vat"|"without_vat")}><option value="without_vat">без НДС</option><option value="with_vat">с НДС</option></select><span/></div></>}
        {billingUnit!=="project_fixed"&&<CalcInput label="Минимальный гарантированный объём / месяц" note="Отдельно от минимального платежа" value={minimumVolumeMonthly} onChange={setMinimumVolumeMonthly} unit={rateUnit==="hour"?"ч":rateUnit==="shift"?"смен":rateUnit==="unit"?unitLabel:"ед."}/>} 
        <CalcInput label="Минимальный гарантированный платёж / месяц" note="Денежная гарантия клиента" value={minimumMonthlyNet} onChange={setMinimumMonthlyNet} unit="₽ без НДС"/>
        <div className="calc-row"><span className="calc-row-check">✓</span><span>Режим НДС</span><select value={vatMode} onChange={event=>setVatMode(event.target.value)}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select><span/></div>
        {vatMode==="with_vat"&&<CalcInput label="Ставка НДС из правил" note="Норматив модели" value={vatPct} onChange={setVatPct} unit="%"/>}
      </details>

      <div className="calc-costs-head"><div><strong>Структура расходов</strong><span>Общепроектные статьи вводятся один раз полной суммой и распределяются на выбранную позицию автоматически.</span></div>{context&&context.roles.length>1&&<span>Доля позиции: <strong>{pct(projectAllocationShare*100)}</strong></span>}</div>
      {groups.map(group=>{const items=costs.filter(cost=>cost.group===group);const active=items.filter(item=>item.enabled).length;return <details className="calc-group calc-cost-group" key={group} open={active>0||group===groups[1]}>
        <summary><span>{group}</span><span>{active?`${active} включено`:"Не используется"}</span></summary>
        <div className="calc-cost-table-head"><span></span><span>Статья / источник</span><span>Значение</span><span>Область</span><span>База</span><span>В месяц</span><span></span></div>
        {items.map(cost=><div className="calc-cost-row" key={cost.id}>
          <input type="checkbox" checked={cost.enabled} onChange={event=>updateCost(cost.id,{enabled:event.target.checked})} aria-label={`Включить ${cost.label}`}/>
          <span><input value={cost.label} onChange={event=>updateCost(cost.id,{label:event.target.value})}/><small>{sourceLabels[cost.source]}{cost.scope==="project"&&context?` · доля ${pct(projectAllocationShare*100)}`:""}</small></span>
          <input type="number" min="0" value={cost.amount} onChange={event=>updateCost(cost.id,{amount:Number(event.target.value)})}/>
          <select value={cost.scope} onChange={event=>setCostScope(cost,event.target.value as CostScope)}>{Object.entries(scopeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
          <select value={cost.base} onChange={event=>updateCost(cost.id,{base:event.target.value as Base})}>{basesForScope(cost.scope).map(key=><option key={key} value={key}>{baseLabels[key]}</option>)}</select>
          <strong className="calc-cost-monthly">{rub(monthlyCostPreview(cost))}</strong>
          <span className="calc-cost-actions"><button type="button" onClick={()=>duplicateCost(cost)} aria-label="Дублировать"><Copy size={14}/></button><button type="button" onClick={()=>setCosts(current=>current.filter(item=>item.id!==cost.id))} aria-label="Удалить"><Trash2 size={14}/></button></span>
        </div>)}
        <button type="button" className="add-expense" onClick={()=>addCost(group)}><Plus size={14}/> Добавить статью</button>
      </details>;})}
      </>}
      {editorTab === "structure" && <section className="rate-structure" aria-label="Структура ставки">
        <header className="rate-structure-head"><div><span>Структура ставки</span><h2>Из чего складывается {rub(result.clientRateNet)} {rateSuffix} без НДС</h2><p>Раскройте категорию, чтобы посмотреть статьи и скорректировать расходы на вкладке «Исходные данные».</p></div><dl><div><dt>Себестоимость</dt><dd>{rub(result.totalCostHourly)} / ч</dd></div><div><dt>Прибыль</dt><dd>{rub(result.monthlyContribution)} / мес.</dd></div><div><dt>Маржа</dt><dd>{pct(result.marginPct)}</dd></div></dl></header>
        <div className="rate-progress"><i style={{width:`${Math.min(100, Math.max(0, 100 - result.marginPct))}%`}}/><b style={{width:`${Math.min(100, Math.max(0, result.marginPct))}%`}}/></div>
        <div className="rate-table" role="table"><div className="rate-table-head" role="row"><span>Категория / статья</span><span>1 час</span><span>1 смена</span><span>1 месяц</span><span>% ставки</span></div>
          {rateGroups.map((group) => { const monthly = group.rows.reduce((sum,row) => sum + row.monthly, 0); const opened = expandedRateGroups.has(group.id); return <div className="rate-table-group" key={group.id}><button type="button" className="rate-group-row" onClick={() => toggleRateGroup(group.id)} aria-expanded={opened}><span><ChevronDown size={15} className={opened ? "is-open" : ""}/><strong>{group.title}</strong><small>{group.rows.length} {group.rows.length === 1 ? "статья" : "статьи"}</small></span><b>{rub(monthly / monthlyHours)}</b><b>{rub(monthly / monthlyShifts)}</b><b>{rub(monthly)}</b><b>{pct(result.monthlyRevenueNet ? monthly / result.monthlyRevenueNet * 100 : 0)}</b></button>{opened && group.rows.map((row) => <div className="rate-line-row" role="row" key={`${group.id}:${row.label}`}><span><strong>{row.label}</strong>{row.note && <small>{row.note}</small>}</span><span>{rub(row.monthly / monthlyHours)}</span><span>{rub(row.monthly / monthlyShifts)}</span><span>{rub(row.monthly)}</span><span>{pct(result.monthlyRevenueNet ? row.monthly / result.monthlyRevenueNet * 100 : 0)}</span></div>)}</div>; })}
          <div className="rate-total-row cost"><span>Полная прямая себестоимость</span><b>{rub(result.totalCostHourly)}</b><b>{rub(result.monthlyCost / monthlyShifts)}</b><b>{rub(result.monthlyCost)}</b><b>{pct(result.monthlyRevenueNet ? result.monthlyCost / result.monthlyRevenueNet * 100 : 0)}</b></div>
          <div className={`rate-total-row profit ${result.monthlyContribution < 0 ? "is-negative" : ""}`}><span>Маржинальная прибыль</span><b>{rub(result.monthlyContribution / monthlyHours)}</b><b>{rub(result.monthlyContribution / monthlyShifts)}</b><b>{rub(result.monthlyContribution)}</b><b>{pct(result.marginPct)}</b></div>
          <div className="rate-client-rate"><span>Коммерческая ставка<br/><strong>{rub(result.clientRateNet)} {rateSuffix} без НДС</strong></span><b>{vatMode === "with_vat" ? `${rub(result.clientRateGross)} ${rateSuffix} с НДС` : "НДС не применяется"}</b></div>
        </div>
      </section>}
    </div>

    <aside className="calc-summary">
      <div className="calc-result">
        <div className="eyebrow">Экономика · {model?.name??"Модель"}</div>
        <div className="big">{rub(result.clientRateNet)}<small> {rateSuffix} без НДС</small></div>
        <div className="price-waterfall" aria-label="Структура экономики">
          <div><span>Оплата персоналу</span><strong>{rub(result.workerPayMonthly)}</strong></div>
          <div><span>Обязательные начисления</span><strong>+ {rub(result.mandatoryChargesMonthly)}</strong></div>
          <div><span>Обеспечение и проектные расходы</span><strong>+ {rub(result.additionalCostsMonthly)}</strong></div>
          <div><span>Резерв</span><strong>+ {rub(result.reserveMonthly)}</strong></div>
          <div className="price-waterfall-total"><span>Себестоимость / месяц</span><strong>{rub(result.monthlyCost)}</strong></div>
          <div><span>{pricingMode==="target_margin"?`Целевая маржа ${pct(margin)}`:pricingMode==="target_profit"?"Целевая прибыль":"Цена из лимита клиента"}</span><strong>{pricingMode==="target_profit"?rub(targetContribution):pricingMode==="client_limit"?rub(clientLimit):""}</strong></div>
          <div className="price-waterfall-total"><span>Цена без НДС</span><strong>{rub(result.clientRateNet)} {rateSuffix}</strong></div>
          {vatMode==="with_vat"&&<div><span>НДС</span><strong>+ {rub(result.clientVatAmount)}</strong></div>}
          {vatMode==="with_vat"&&<div className="price-waterfall-total"><span>Цена клиенту с НДС</span><strong>{rub(result.clientRateGross)} {rateSuffix}</strong></div>}
        </div>
        <div className="calc-kpi-grid"><div><span>Маржа</span><strong>{pct(result.marginPct)}</strong></div><div><span>Прибыль / мес.</span><strong>{rub(result.monthlyContribution)}</strong></div><div><span>Точка безубыточности</span><strong>{rub(result.breakEvenRateNet)} {rateSuffix}</strong></div><div><span>Выручка / мес.</span><strong>{rub(result.monthlyRevenueNet)}</strong></div></div>
        {minimumVolumeMonthly>0&&<div className="calc-kv"><span>Гарантированный объём</span><strong>{result.guaranteedBillableVolumeMonthly} / мес.</strong></div>}
        {minimumMonthlyNet>0&&<div className="calc-kv"><span>Минимальный платёж</span><strong>{rub(result.minimumMonthlyNet)}</strong></div>}
        <div className="calc-kv"><span>Вклад за расчётный срок</span><strong>{rub(result.projectContribution)}</strong></div>
        {context&&totalProjectWorkers>workers&&<p className="calc-disclaimer">Общепроектные статьи распределяются {allocationMode==="headcount"?"по численности":"по трудочасам"}. На выбранную позицию приходится {pct(projectAllocationShare*100)}.</p>}
        {result.warnings.length>0&&<div className="compliance-panel"><strong>Проверить перед согласованием</strong>{result.warnings.map((warning:string)=><span key={warning}>{warningLabels[warning]??warning}</span>)}</div>}
        {context&&<button className="button primary calc-save" type="button" onClick={saveScenario} disabled={saveState.busy||workerPayAmount<=0}><Save size={14}/>{saveState.busy?"Сохранение…":seed?"Сохранить новую версию сценария":"Сохранить новый сценарий"}</button>}
        {saveState.message&&<p className={saveState.error?"form-error":"form-message"}>{saveState.message}</p>}
        <button className="button calc-export" type="button" onClick={exportSummary}><Download size={14}/> Экспорт CSV</button>
        {!context&&<p className="calc-disclaimer">Быстрый режим не сохраняет результат в коммерческий процесс. Для рабочего расчёта откройте его из заявки или тендера.</p>}
      </div>
    </aside>
  </div>;
}

function CalcInput({label,note,value,onChange,unit}:{label:string;note?:string;value:number;onChange:(value:number)=>void;unit:string}) {
  return <div className="calc-row"><span className="calc-row-check">✓</span><span>{label}{note&&<small>{note}</small>}</span><input type="number" min="0" value={value} onChange={event=>onChange(Number(event.target.value))}/><span>{unit}</span></div>;
}
