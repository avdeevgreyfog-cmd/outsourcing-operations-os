"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CommercialCalculationRow } from "@/lib/commercial/calculation-list";
import { SalesEmpty, SalesMetrics, SalesSearch, SalesSegments } from "@/components/sales/SalesUI";
import { Status } from "@/components/UI";
import { SubmitApprovalButton } from "@/components/CommercialWorkflowActions";
import { pct, rub } from "@/lib/ui/format";

type View = "calculations" | "scenarios";
type Filter = "all" | "work" | "review" | "attention" | "accepted" | "history";

const billingLabels: Record<string, string> = {
  hour: "час",shift: "смена",unit: "объём",worker_month: "сотрудник / месяц",project_month: "проект / месяц",project_fixed: "фикс за проект",mixed: "смешанная",
};
const statusLabels: Record<string, string> = {
  draft: "Черновик",review: "На согласовании",pending: "На согласовании",accepted: "Принято",rejected: "Отклонено",superseded: "Историческая версия",approved: "Согласовано",
};
function statusLabel(value:string){return statusLabels[value]??(/[A-Za-z_]/.test(value)?"Другой статус":value);}
function tone(value:string){if(value==="accepted"||value==="approved")return "good" as const;if(value==="rejected")return "bad" as const;if(value==="review"||value==="pending")return "warn" as const;return "neutral" as const;}
function sourceHref(row:CommercialCalculationRow){return row.sourceType==="tender"?`/tenders/${row.sourceId}?tab=calculations`:`/requests/${row.sourceId}`;}
function billingLabel(row:CommercialCalculationRow){return row.billingUnit==="unit"&&row.billingUnitLabel?row.billingUnitLabel:(billingLabels[row.billingUnit]??"другая схема");}
function matchesFilter(row:CommercialCalculationRow,filter:Filter){
  if(filter==="work")return ["draft","rejected"].includes(row.status)&&!['approved','superseded'].includes(row.calculationStatus);
  if(filter==="review")return row.status==="review"||row.status==="pending";
  if(filter==="attention")return row.warnings.length>0||row.status==="rejected";
  if(filter==="accepted")return row.status==="accepted";
  if(filter==="history")return row.status==="superseded"||row.calculationStatus==="superseded";
  return true;
}

type Group={key:string;calculationId:string;version:number;status:string;sourceType:CommercialCalculationRow["sourceType"];sourceId:string;source:string;economicsDate:string|null;rows:CommercialCalculationRow[]};

export function CalculationsRegistryWorkspace({rows,canEdit=false,compact=false,defaultView}:{
  rows:CommercialCalculationRow[];canEdit?:boolean;compact?:boolean;defaultView?:View;
}){
  const [view,setView]=useState<View>(defaultView??(compact?"scenarios":"calculations"));
  const [filter,setFilter]=useState<Filter>("all");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string[]>([]);

  const allGroups=useMemo(()=>{
    const map=new Map<string,Group>();
    for(const row of rows){const key=row.calculationId;const current=map.get(key);if(current)current.rows.push(row);else map.set(key,{key,calculationId:row.calculationId,version:row.calculationVersion,status:row.calculationStatus,sourceType:row.sourceType,sourceId:row.sourceId,source:row.source,economicsDate:row.economicsDate,rows:[row]});}
    return [...map.values()];
  },[rows]);
  const inWork=allGroups.filter(group=>group.status==="draft").length;
  const review=allGroups.filter(group=>group.status==="review").length;
  const attention=allGroups.filter(group=>group.rows.some(row=>row.warnings.length>0||row.status==="rejected")).length;
  const accepted=allGroups.filter(group=>group.status==="approved").length;

  const filtered=useMemo(()=>rows.filter(row=>{if(!matchesFilter(row,filter))return false;const needle=query.trim().toLowerCase();if(!needle)return true;return `${row.source} ${row.role} ${row.name} ${row.model} v${row.calculationVersion}`.toLowerCase().includes(needle);}),[rows,filter,query]);
  const groups=useMemo(()=>{const map=new Map<string,Group>();for(const row of filtered){const key=row.calculationId;const current=map.get(key);if(current)current.rows.push(row);else map.set(key,{key,calculationId:row.calculationId,version:row.calculationVersion,status:row.calculationStatus,sourceType:row.sourceType,sourceId:row.sourceId,source:row.source,economicsDate:row.economicsDate,rows:[row]});}return [...map.values()];},[filtered]);
  const selectedRows=selected.map(id=>rows.find(row=>row.id===id)).filter(Boolean) as CommercialCalculationRow[];
  function toggleScenario(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=4?current:[...current,id]);}
  function reset(){setQuery("");setFilter("all");}

  return <div className="request-final-registry request-baseline-registry calculation-registry">
    {!compact&&<SalesMetrics label="Сводка по расчётам" items={[
      {label:"В работе",value:inWork,note:"актуальные версии расчётов"},{label:"На согласовании",value:review,note:"ожидают решения"},{label:"Требуют внимания",value:attention,note:"риски и возвраты"},{label:"Согласовано",value:accepted,note:"зафиксированные версии"},
    ]}/>}
    <div className="sales-registry">
      <div className="sales-toolbar">
        <SalesSegments<View> label="Представление расчётов" value={view} onChange={setView} items={[{value:"calculations",label:"Расчёты"},{value:"scenarios",label:"Все сценарии"}]}/>
        <div className="sales-toolbar-actions"><select aria-label="Фильтр расчётов" value={filter} onChange={event=>setFilter(event.target.value as Filter)}><option value="all">Все статусы</option><option value="work">В работе</option><option value="review">На согласовании</option><option value="attention">Требуют внимания</option><option value="accepted">Принято</option><option value="history">Исторические</option></select><SalesSearch value={query} onChange={setQuery} placeholder="Клиент, заявка, позиция или сценарий"/></div>
      </div>
      <div className="sales-results" aria-live="polite">Показано {view==="calculations"?groups.length:filtered.length} · сценариев {filtered.length}</div>

      {view==="calculations"?<div className="request-table-wrap"><table className="data-table calculation-version-table"><thead><tr><th>Расчёт</th><th>Статус</th><th>Позиции</th><th>Сценарии</th><th>Принято</th><th>Экономика</th><th>Риски</th></tr></thead><tbody>{groups.length?groups.map(group=>{
        const roleCount=new Set(group.rows.map(row=>row.sourceRoleId)).size;const acceptedRoles=new Set(group.rows.filter(row=>row.status==="accepted").map(row=>row.sourceRoleId)).size;const warnings=group.rows.reduce((sum,row)=>sum+row.warnings.length,0);const acceptedRows=group.rows.filter(row=>row.status==="accepted");const avgMargin=acceptedRows.length?acceptedRows.reduce((sum,row)=>sum+Number(row.marginPct),0)/acceptedRows.length:null;const contribution=acceptedRows.reduce((sum,row)=>sum+Number(row.monthlyContribution),0);
        return <tr key={group.key}><td><Link className="cell-title" href={`/calculations/${group.calculationId}`}>{group.source} · v{group.version}</Link><span className="cell-sub">{group.sourceType==="tender"?"Тендер":"Заявка"}{group.economicsDate?` · экономика на ${new Intl.DateTimeFormat("ru-RU").format(new Date(`${group.economicsDate}T00:00:00`))}`:""}</span></td><td><Status tone={tone(group.status)}>{statusLabel(group.status)}</Status></td><td className="num">{roleCount}</td><td className="num">{group.rows.length}</td><td><strong>{acceptedRoles}/{roleCount}</strong><span className="cell-sub">позиций с принятой экономикой</span></td><td>{avgMargin==null?"—":pct(avgMargin)}<span className="cell-sub">{contribution>0?`${rub(contribution)} вклад / мес.`:"Нет принятой экономики"}</span></td><td>{warnings>0?<Status tone="warn">{warnings} сигналов</Status>:<Status tone="good">Без сигналов</Status>}</td></tr>;
      }):<tr><td colSpan={7}><SalesEmpty onReset={reset}/></td></tr>}</tbody></table></div>:<>
        <div className="request-table-wrap"><table className="data-table calculation-scenario-table"><thead><tr><th aria-label="Выбор для сравнения"></th><th>Источник / позиция</th><th>Версия</th><th>Модель</th><th>Сотруднику</th><th>Себестоимость / ч</th><th>Клиенту</th><th>Маржа</th><th>Статус</th><th></th></tr></thead><tbody>{filtered.length?filtered.map(row=><tr key={row.id}>
          <td><input type="checkbox" aria-label={`Сравнить ${row.name}`} checked={selected.includes(row.id)} onChange={()=>toggleScenario(row.id)} disabled={!selected.includes(row.id)&&selected.length>=4}/></td>
          <td><Link className="cell-title" href={`/calculations/${row.calculationId}`}>{row.source} · {row.role}</Link><span className="cell-sub">{row.name} · {billingLabel(row)}</span></td>
          <td><strong>v{row.scenarioVersion}</strong><span className="cell-sub">расчёт v{row.calculationVersion}</span></td>
          <td>{row.model}<span className="cell-sub">{row.ruleVersion?`Правила №${row.ruleVersion}`:"Без версии правил"}</span></td><td className="num">{rub(row.workerNet)}</td><td className="num">{rub(row.totalCost)}</td><td className="num">{rub(row.clientRate)}<span className="cell-sub">без НДС</span></td><td className="num">{pct(row.marginPct)}</td>
          <td><Status tone={tone(row.status)}>{statusLabel(row.status)}</Status>{row.warnings.length>0&&<span className="cell-sub">Сигналов: {row.warnings.length}</span>}</td>
          <td><div className="calculation-row-actions">{canEdit&&["draft","rejected"].includes(row.status)&&<SubmitApprovalButton subjectType="calculation_scenario" subjectId={row.id}/>} {canEdit&&!['approved','superseded'].includes(row.calculationStatus)&&<Link className="button" href={`/calculations/${row.calculationId}?seed=${row.id}`}>Взять за основу</Link>}<Link className="button" href={sourceHref(row)}>Источник</Link></div></td>
        </tr>):<tr><td colSpan={10}><SalesEmpty onReset={reset}/></td></tr>}</tbody></table></div>
        {selectedRows.length>=2&&<div className="request-table-wrap calculation-compare-table"><table className="data-table"><thead><tr><th>Показатель</th>{selectedRows.map(row=><th key={row.id}>{row.name}<span className="cell-sub">{row.role} · v{row.scenarioVersion}</span></th>)}</tr></thead><tbody>
          <tr><td>Модель</td>{selectedRows.map(row=><td key={row.id}>{row.model}</td>)}</tr><tr><td>Сотруднику</td>{selectedRows.map(row=><td className="num" key={row.id}>{rub(row.workerNet)}</td>)}</tr><tr><td>Себестоимость / ч</td>{selectedRows.map(row=><td className="num" key={row.id}>{rub(row.totalCost)}</td>)}</tr><tr><td>Ставка клиенту</td>{selectedRows.map(row=><td className="num" key={row.id}>{rub(row.clientRate)}</td>)}</tr><tr><td>Маржа</td>{selectedRows.map(row=><td className="num" key={row.id}>{pct(row.marginPct)}</td>)}</tr><tr><td>Вклад / месяц</td>{selectedRows.map(row=><td className="num" key={row.id}>{rub(row.monthlyContribution)}</td>)}</tr><tr><td>Нормативы</td>{selectedRows.map(row=><td key={row.id}>{row.warnings.length?<Status tone="warn">Есть отклонения</Status>:<Status tone="good">Соответствует</Status>}</td>)}</tr>
        </tbody></table></div>}
      </>}
    </div>
  </div>;
}
