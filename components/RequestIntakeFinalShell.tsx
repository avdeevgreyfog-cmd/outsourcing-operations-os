"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { RequestIntakeWorkspacePolished } from "@/components/RequestIntakeWorkspacePolished";
import type { RateMemoryRow } from "@/lib/commercial/rate-references";

const RATE_STORAGE_KEY="operis.rate-memory.v1";
const RATE_STORAGE_EVENT="operis:rate-memory";
type Props = ComponentProps<typeof RequestIntakeWorkspacePolished>;
type LiveSummary = { headcount:number; positions:number; start:string; schedule:string; owner:string; providedByUs:string[] };

const provisionNames: Record<string,string> = {
  housing:"Проживание", travel:"Билеты", shuttle:"Развозка", meals:"Питание", workwear:"Спецодежда", ppe:"СИЗ", tools:"Инструмент", consumables:"Расходняк",
};
function formatDate(value: string | null | undefined) {
  if (!value) return "Не указан";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day:"2-digit", month:"short", year:"numeric" });
}
function scheduleLabel(value: string | undefined) {
  if (!value) return "Уточняется";
  if (value === "rotation") return "Вахта";
  if (value === "on_demand") return "По заявке";
  if (value === "custom") return "Другой";
  return value;
}
function localRateRows(){
  try{const value=JSON.parse(window.localStorage.getItem(RATE_STORAGE_KEY)??"[]") as RateMemoryRow[];return Array.isArray(value)?value:[];}catch{return [];}
}
function bounds(values:Array<number|null|undefined>){const finite=values.filter((value):value is number=>value!=null&&Number.isFinite(value));return finite.length?[Math.min(...finite),Math.max(...finite)] as const:[null,null] as const;}

export function RequestIntakeFinalShell(props: Props) {
  const rootRef=useRef<HTMLDivElement>(null);
  const roles=useMemo(()=>props.request?.roles??[],[props.request?.roles]);
  const initialTotal=useMemo(()=>roles.reduce((sum,role)=>sum+role.count,0),[roles]);
  const initialSchedule=props.intake?.schedule.pattern||String(props.request?.schedule?.pattern??"");
  const initialProvision=(props.intake?.provision??{}) as Record<string,{provider?:string}>;
  const initialUs=Object.entries(initialProvision).filter(([,value])=>value?.provider==="us").map(([key])=>provisionNames[key]).filter(Boolean);
  const [summary,setSummary]=useState<LiveSummary>({
    headcount:initialTotal,
    positions:roles.length,
    start:props.request?.startDate??"",
    schedule:initialSchedule,
    owner:props.workflowMeta?.owner??(props.request?"Не назначен":"Вы станете ответственным"),
    providedByUs:initialUs,
  });
  const [rateRows,setRateRows]=useState<RateMemoryRow[]>([]);

  useEffect(()=>{
    if(!props.demo)return;
    const sync=()=>setRateRows(localRateRows());
    const timer=window.setTimeout(sync,0);
    window.addEventListener(RATE_STORAGE_EVENT,sync);window.addEventListener("storage",sync);
    return()=>{window.clearTimeout(timer);window.removeEventListener(RATE_STORAGE_EVENT,sync);window.removeEventListener("storage",sync);};
  },[props.demo]);

  const workspaceProps=useMemo<Props>(()=>{
    if(!props.demo||!rateRows.length)return props;
    const specialties=props.options.specialties.map(item=>{
      const matching=rateRows.filter(row=>row.specialty.trim().toLowerCase()===item.name.trim().toLowerCase());
      if(!matching.length)return item;
      const [localWorkerMin,localWorkerMax]=bounds(matching.flatMap(row=>[row.amountMin,row.amountMax]));
      const [localClientMin,localClientMax]=bounds(matching.flatMap(row=>[row.clientRateMin,row.clientRateMax]));
      const workerMin=bounds([item.stats.workerPayMin,localWorkerMin])[0];
      const workerMax=bounds([item.stats.workerPayMax,localWorkerMax])[1];
      const clientMin=bounds([item.stats.clientRateMin,localClientMin])[0];
      const clientMax=bounds([item.stats.clientRateMax,localClientMax])[1];
      const clientValues=matching.flatMap(row=>[row.clientRateMin,row.clientRateMax]).filter((value):value is number=>value!=null&&Number.isFinite(value));
      const localMid=clientValues.length?clientValues.reduce((sum,value)=>sum+value,0)/clientValues.length:null;
      return {...item,stats:{...item.stats,sampleCount:item.stats.sampleCount+matching.length,workerPayMin:workerMin,workerPayMax:workerMax,clientRateMin:clientMin,clientRateMax:clientMax,clientRateMedian:item.stats.clientRateMedian??localMid}};
    });
    return {...props,options:{...props.options,specialties}};
  },[props,rateRows]);

  useEffect(()=>{
    const root=rootRef.current; if(!root)return;
    const main=root.querySelector<HTMLElement>(".request-final-editor-main"); if(!main)return;
    const replacements:Array<[string,string]>=[["Клиент в CRM","Клиент в системе"],["Скачать Excel-шаблон","Скачать шаблон таблицы"],["Импорт из Excel","Загрузить из таблицы"]];
    const replaceCopy=()=>{
      for(const element of main.querySelectorAll("label,button")) for(const node of element.childNodes) if(node.nodeType===Node.TEXT_NODE&&node.textContent){let next=node.textContent;for(const [from,to] of replacements)next=next.replace(from,to);if(next!==node.textContent)node.textContent=next;}
    };
    const sync=()=>{
      replaceCopy();
      setSummary(current=>{
        let next={...current};
        const navText=main.querySelector(".request-v2-nav-summary span")?.textContent??"";
        const match=navText.match(/(\d+)\s*чел\..*?(\d+)\s*позиц/i); if(match)next={...next,headcount:Number(match[1]),positions:Number(match[2])};
        const dateInput=main.querySelector<HTMLInputElement>('input[type="date"]'); if(dateInput)next={...next,start:dateInput.value};
        const scheduleValues=new Set(["5/2","6/1","7/0","2/2","3/3","rotation","on_demand","custom"]);
        const scheduleSelect=Array.from(main.querySelectorAll<HTMLSelectElement>("select")).find(select=>scheduleValues.has(select.value)); if(scheduleSelect)next={...next,schedule:scheduleSelect.value};
        const ownerLabel=Array.from(main.querySelectorAll<HTMLLabelElement>("label")).find(label=>label.textContent?.trim().startsWith("Ответственный")); const ownerSelect=ownerLabel?.querySelector("select"); if(ownerSelect)next={...next,owner:(ownerSelect.selectedOptions[0]?.textContent??current.owner).trim()};
        const provisionRows=Array.from(main.querySelectorAll<HTMLElement>(".provision-matrix-row")); if(provisionRows.length){const us=provisionRows.filter(row=>Array.from(row.querySelectorAll("button.active")).some(button=>button.textContent?.trim()==="Мы")).map(row=>row.querySelector("strong")?.textContent?.trim()??"").filter(Boolean);next={...next,providedByUs:us};}
        const same=current.headcount===next.headcount&&current.positions===next.positions&&current.start===next.start&&current.schedule===next.schedule&&current.owner===next.owner&&current.providedByUs.join("|")===next.providedByUs.join("|");
        return same?current:next;
      });
    };
    const scheduleSync=()=>window.setTimeout(sync,0);
    main.addEventListener("input",scheduleSync,true); main.addEventListener("change",scheduleSync,true); main.addEventListener("click",scheduleSync,true);
    const observer=new MutationObserver(scheduleSync); observer.observe(main,{subtree:true,childList:true,characterData:true}); sync();
    return()=>{main.removeEventListener("input",scheduleSync,true);main.removeEventListener("change",scheduleSync,true);main.removeEventListener("click",scheduleSync,true);observer.disconnect();};
  },[]);

  return <div className="request-final-editor-shell request-baseline-editor" ref={rootRef}>
    <div className="request-final-editor-main"><RequestIntakeWorkspacePolished {...workspaceProps}/></div>
    <aside className="request-final-context" aria-label="Сводка заявки">
      <div className="request-final-context-head"><span>Сводка заявки</span><strong>{props.request?"Условия":"Новая заявка"}</strong></div>
      <div className="request-final-context-metrics">
        <div><span>Потребность</span><strong>{summary.headcount?`${summary.headcount} чел.`:"Не указана"}</strong></div>
        <div><span>Позиции</span><strong>{summary.positions||"Не добавлены"}</strong></div>
        <div><span>Старт</span><strong>{formatDate(summary.start)}</strong></div>
        <div><span>График</span><strong>{scheduleLabel(summary.schedule)}</strong></div>
      </div>
      <div className="request-final-context-block"><span>Ответственный</span><strong>{summary.owner}</strong></div>
      <div className="request-final-context-block"><span>Обеспечиваем мы</span><strong className="request-baseline-provision-summary">{summary.providedByUs.length?summary.providedByUs.join(" · "):"Пока не выбрано"}</strong></div>
      <div className="request-final-context-note"><i/><span>Сводка обновляется по мере заполнения формы.</span></div>
    </aside>
  </div>;
}
