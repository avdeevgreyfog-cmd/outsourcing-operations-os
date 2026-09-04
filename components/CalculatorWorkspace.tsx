"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Download, Plus, Save, Trash2 } from "lucide-react";
import { calculateScenario } from "@/lib/core/calculator.mjs";
import { pct, rub } from "@/lib/ui/format";

type Base = "per_hour" | "per_shift" | "per_worker_month" | "project_month";
type Cost = { id: string; group: string; label: string; amount: number; base: Base; enabled: boolean };
type Context = {requestId:string;roles:Array<{id:string;specialty:string;count:number}>;models:Array<{id:string;name:string;code:string}>};
const groups = ["Налоги и обязательные начисления", "Регулярное обеспечение", "Транспорт и проживание", "СИЗ и медицина", "Подбор и управление", "Прочие расходы"];
const initial: Cost[] = [
  { id: "tax", group: groups[0], label: "Начисления выбранной модели", amount: 82, base: "per_hour", enabled: true },
  { id: "housing", group: groups[2], label: "Проживание", amount: 400, base: "per_shift", enabled: true },
  { id: "travel", group: groups[2], label: "Проезд и логистика", amount: 18, base: "per_hour", enabled: true },
  { id: "ppe", group: groups[3], label: "СИЗ и спецодежда", amount: 2100, base: "per_worker_month", enabled: true },
  { id: "medical", group: groups[3], label: "Медицина", amount: 0, base: "per_worker_month", enabled: false },
  { id: "recruit", group: groups[4], label: "Подбор и запуск", amount: 35000, base: "project_month", enabled: true },
  { id: "manager", group: groups[4], label: "Управление объектом", amount: 65000, base: "project_month", enabled: true },
];
const modelLabels = { employment: "Трудовой договор", gph: "ГПХ", npd: "НПД / самозанятый", custom: "Модель компании" };

export function CalculatorWorkspace({context}:{context?:Context}) {
  const router=useRouter();
  const [model, setModel] = useState<keyof typeof modelLabels>("employment");
  const [selectedRoleId,setSelectedRoleId]=useState(context?.roles[0]?.id??"");
  const selectedRole=context?.roles.find(role=>role.id===selectedRoleId);
  const [scenarioName,setScenarioName]=useState("Базовый сценарий");
  const [saveState,setSaveState]=useState<{busy:boolean;message:string;error:boolean}>({busy:false,message:"",error:false});
  const [worker, setWorker] = useState(390); const [workers, setWorkers] = useState(selectedRole?.count??24); const [hours, setHours] = useState(242); const [shiftHours, setShiftHours] = useState(11); const [margin, setMargin] = useState(18); const [costs, setCosts] = useState(initial);
  const normalized = useMemo(() => costs.map((cost) => ({ ...cost, hourlyAmount: cost.base === "per_hour" ? cost.amount : cost.base === "per_shift" ? cost.amount / shiftHours : cost.base === "per_worker_month" ? cost.amount / hours : cost.amount })), [costs, hours, shiftHours]);
  const employee = normalized.filter((item) => item.base !== "project_month"); const project = normalized.filter((item) => item.base === "project_month");
  const result = useMemo(() => calculateScenario({ workerNetHourly: worker, workers, hoursPerWorker: hours, targetMarginPct: margin, employeeCosts: employee, projectCosts: project }), [worker, workers, hours, margin, employee, project]);
  function update(id: string, patch: Partial<Cost>) { setCosts((value) => value.map((cost) => cost.id === id ? { ...cost, ...patch } : cost)) }
  function add(group: string) { setCosts((value) => [...value, { id: crypto.randomUUID(), group, label: "Новая статья", amount: 0, base: "per_hour", enabled: true }]) }
  function duplicate(cost: Cost) { setCosts((value) => [...value, { ...cost, id: crypto.randomUUID(), label: `${cost.label} — копия` }]) }
  function exportSummary() { const lines = [["Показатель", "Значение"], ["Модель", modelLabels[model]], ["Сотруднику, ₽/ч", worker], ["Себестоимость, ₽/ч", result.totalCostHourly], ["Ставка клиенту, ₽/ч", result.clientRateHourly], ["Маржа, %", result.marginPct], ["Вклад в прибыль за месяц", result.monthlyContribution]]; const csv = lines.map((row) => row.map((value) => `"${value}"`).join(";")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); link.download = "расчёт-сценария.csv"; link.click(); URL.revokeObjectURL(link.href) }
  async function saveScenario(){
    if(!context||!selectedRoleId)return;
    const modelOption=context.models.find(item=>item.code===model)??context.models[0];if(!modelOption){setSaveState({busy:false,message:"Нет активной модели расчёта",error:true});return}
    setSaveState({busy:true,message:"",error:false});
    const response=await fetch("/api/calculations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      requestId:context.requestId,requestRoleId:selectedRoleId,modelId:modelOption.id,name:scenarioName,
      inputs:{workerNetHourly:worker,workers,hoursPerWorker:hours,shiftHours,targetMarginPct:margin,model},
      costs:normalized.map(({id,group,label,amount,base,enabled,hourlyAmount})=>({id,group,label,amount,base,enabled,hourlyAmount})),
      result,
    })});
    const json=await response.json().catch(()=>({}));if(!response.ok){setSaveState({busy:false,message:json.error??"Не удалось сохранить сценарий",error:true});return}
    setSaveState({busy:false,message:"Сценарий сохранён. Теперь его можно отправить на согласование.",error:false});router.refresh();
  }

  return <div className="calc-layout"><section className="section">
    {context&&<div className="commercial-calc-context"><label>Позиция заявки<select value={selectedRoleId} onChange={event=>{setSelectedRoleId(event.target.value);const role=context.roles.find(item=>item.id===event.target.value);if(role)setWorkers(role.count)}}>{context.roles.map(role=><option key={role.id} value={role.id}>{role.specialty} · {role.count} чел.</option>)}</select></label><label>Название сценария<input value={scenarioName} onChange={event=>setScenarioName(event.target.value)}/></label></div>}
    <div className="scenario-tabs">{Object.entries(modelLabels).map(([key, label]) => <button key={key} type="button" className={model === key ? "active" : ""} onClick={() => setModel(key as keyof typeof modelLabels)}>{label}</button>)}</div>
    <div className="compliance-note"><AlertTriangle size={15}/><span>Юридические и налоговые параметры не подтверждены активной версией правил. Перед согласованием расчёта требуется актуальная конфигурация.</span></div>{model === "npd" && <div className="compliance-panel"><strong>Проверка режима НПД</strong><span>Годовой доход, лимит и прогноз пересечения не рассчитываются без действующей версии правового правила.</span></div>}
    <details className="calc-group" open><summary><span>Выплата сотруднику и объём</span><span>{rub(worker)}/ч</span></summary><CalcInput label="Ставка на руки" value={worker} onChange={setWorker} unit="₽/ч"/><CalcInput label="Количество сотрудников" value={workers} onChange={setWorkers} unit="чел."/><CalcInput label="Часов на сотрудника / месяц" value={hours} onChange={setHours} unit="ч"/><CalcInput label="Оплачиваемых часов / смену" value={shiftHours} onChange={setShiftHours} unit="ч"/></details>
    {groups.map((group) => { const items = costs.filter((cost) => cost.group === group); return <details className="calc-group" open key={group}><summary><span>{group}</span><span>{rub(items.filter((item) => item.enabled).reduce((sum, item) => sum + (normalized.find((value) => value.id === item.id)?.hourlyAmount ?? 0), 0))}/ч</span></summary>{items.map((cost) => <div className="calc-row calc-row-full" key={cost.id}><input type="checkbox" checked={cost.enabled} onChange={(event) => update(cost.id, { enabled: event.target.checked })} aria-label={`Включить ${cost.label}`}/><input className="expense-name" value={cost.label} onChange={(event) => update(cost.id, { label: event.target.value })}/><input type="number" value={cost.amount} onChange={(event) => update(cost.id, { amount: Number(event.target.value) })}/><select value={cost.base} onChange={(event) => update(cost.id, { base: event.target.value as Base })}><option value="per_hour">₽/ч</option><option value="per_shift">₽/смену</option><option value="per_worker_month">₽/чел./мес</option><option value="project_month">₽/проект/мес</option></select><button type="button" onClick={() => duplicate(cost)} aria-label="Дублировать"><Copy size={14}/></button><button type="button" onClick={() => setCosts((value) => value.filter((item) => item.id !== cost.id))} aria-label="Удалить"><Trash2 size={14}/></button></div>)}<button type="button" className="add-expense" onClick={() => add(group)}><Plus size={14}/> Добавить статью</button></details> })}
  </section><aside className="section calc-summary"><div className="calc-result"><div className="eyebrow">Сценарий · {modelLabels[model]}</div><div className="big">{rub(result.clientRateHourly)}<small> / ч</small></div><label className="margin-control">Целевая маржа <input type="number" value={margin} min="0" max="99" onChange={(event) => setMargin(Number(event.target.value))}/>%</label><div className="calc-kv"><span>Себестоимость / ч</span><strong>{rub(result.totalCostHourly)}</strong></div><div className="calc-kv"><span>Маржа / ч</span><strong>{rub(result.marginHourly)}</strong></div><div className="calc-kv"><span>Фактическая маржа</span><strong>{pct(result.marginPct)}</strong></div><div className="calc-kv"><span>Выручка / месяц</span><strong>{rub(result.monthlyRevenue)}</strong></div><div className="calc-kv"><span>Вклад в прибыль / месяц</span><strong>{rub(result.monthlyContribution)}</strong></div>{context&&<button className="button primary" style={{ width: "100%", marginTop: 16 }} type="button" onClick={saveScenario} disabled={saveState.busy}><Save size={14}/>{saveState.busy?" Сохранение…":" Сохранить сценарий"}</button>}<button className="button" style={{ width: "100%", marginTop: 8 }} type="button" onClick={exportSummary}><Download size={14}/> Экспортировать сводку</button>{saveState.message&&<p className={saveState.error?"form-error":"form-success"}>{saveState.message}</p>}<p className="calc-disclaimer">Согласованный сценарий становится неизменяемой исторической версией. При пересчёте создавайте новый сценарий.</p></div></aside></div>;
}

function CalcInput({ label, value, onChange, unit }: { label: string; value: number; onChange: (value: number) => void; unit: string }) { return <div className="calc-row"><span>✓</span><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))}/><span>{unit}</span></div> }
