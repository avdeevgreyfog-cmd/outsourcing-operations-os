"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Save, ShieldCheck } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { TimesheetData, TimesheetWorkerRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";

type Mode="first"|"second"|"month";
type View="client"|"internal";

export function TimesheetWorkspace({data,options,sensitive,canEdit,canSubmit}:{data:TimesheetData;options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;canSubmit:boolean}){
  const router=useRouter();
  const [mode,setMode]=useState<Mode>("month");
  const [view,setView]=useState<View>(sensitive?"internal":"client");
  const [rows,setRows]=useState<TimesheetWorkerRow[]>(data.rows);
  const [saving,setSaving]=useState("");
  const [message,setMessage]=useState("");
  const lastDay=Number(data.periodEnd.slice(8,10));
  const allDays=useMemo(()=>range(1,lastDay),[lastDay]);
  const days=mode==="first"?allDays.filter(day=>day<=15):mode==="second"?allDays.filter(day=>day>=16):allDays;
  const visibleRows=rows.map(row=>({...row,visibleTotal:days.reduce((sum,day)=>sum+numericCell(row.days?.[String(day)]),0)}));
  const totals=days.map(day=>visibleRows.reduce((sum,row)=>sum+numericCell(row.days?.[String(day)]),0));
  const totalHours=visibleRows.reduce((sum,row)=>sum+row.visibleTotal,0);
  const totalNight=visibleRows.reduce((sum,row)=>sum+Number(row.night??0),0);
  const totalOvertime=visibleRows.reduce((sum,row)=>sum+Number(row.overtime??0),0);

  function changeContext(objectId:string,month:string){
    const params=new URLSearchParams();if(objectId)params.set("object",objectId);if(month)params.set("month",month);
    router.push("/timesheets?"+params.toString());
  }
  async function saveCell(workerId:string,day:number,value:string){
    if(!canEdit||view!=="internal")return;
    const key=workerId+":"+day;setSaving(key);setMessage("");
    try{
      const workDate=data.month+"-"+String(day).padStart(2,"0");
      const response=await fetch("/api/timesheets/entries",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workerId,objectId:data.objectId,workDate,value})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить");
      setRows(current=>current.map(row=>row.workerId===workerId?{...row,days:{...(row.days??{}),[String(day)]:normalizeCell(value)}}:row));
      setMessage("Изменение сохранено");
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось сохранить");}
    finally{setSaving("");}
  }
  async function submitSnapshot(){
    setMessage("");
    try{
      const response=await fetch("/api/timesheets/snapshots",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({objectId:data.objectId,periodStart:data.periodStart,periodEnd:data.periodEnd,viewType:view})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось зафиксировать табель");
      setMessage(view==="client"?"Клиентская версия зафиксирована":"Внутренняя версия зафиксирована");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось зафиксировать табель");}
  }
  function exportCsv(){
    const header=["Сотрудник",...days.map(day=>String(day).padStart(2,"0")+"."+data.month.slice(5,7)),"Часы",...(view==="internal"&&sensitive?["Ставка","Начислено"]:[])];
    const body=visibleRows.map(row=>[row.name,...days.map(day=>row.days?.[String(day)]??""),row.visibleTotal,...(view==="internal"&&sensitive?[row.rate??"",row.accrual??""]:[])]);
    const csv=[header,...body].map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(";")).join("\n");
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));link.download="timesheet-"+data.month+"-"+view+".csv";link.click();URL.revokeObjectURL(link.href);
  }

  return <>
    <div className="scheduler-controls">
      <div className="page-actions">
        <select value={data.objectId} onChange={e=>changeContext(e.target.value,data.month)} aria-label="Объект">{options.objects.map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select>
        <input type="month" value={data.month} onChange={e=>changeContext(data.objectId,e.target.value)} aria-label="Месяц"/>
        <div className="segmented">{(["first","second","month"] as Mode[]).map(value=><button type="button" key={value} className={mode===value?"active":""} onClick={()=>setMode(value)}>{value==="first"?"1–15":value==="second"?"16–конец":"Весь месяц"}</button>)}</div>
      </div>
      <div className="page-actions">
        <div className="segmented"><button type="button" className={view==="client"?"active":""} onClick={()=>setView("client")}>Клиентский</button>{sensitive&&<button type="button" className={view==="internal"?"active":""} onClick={()=>setView("internal")}>Внутренний</button>}</div>
        <button className="button" type="button" onClick={exportCsv}><Download size={14}/> CSV</button>
        {view==="client"&&<button className="button" type="button" onClick={()=>window.print()}><Printer size={14}/> Печать</button>}
        {canSubmit&&<button className="button primary" type="button" onClick={()=>void submitSnapshot()}><Save size={14}/> {view==="client"?"Зафиксировать клиентский":"Зафиксировать внутренний"}</button>}
      </div>
    </div>
    <div className="timesheet-summary">
      <Metric label="Сотрудники" value={visibleRows.length} note="в текущем периоде"/>
      <Metric label="Факт" value={totalHours+" ч"} note={mode==="month"?"за месяц":"за выбранную половину"}/>
      <Metric label="Ночные" value={totalNight+" ч"}/>
      <Metric label="Переработка" value={totalOvertime+" ч"} tone={totalOvertime>0?"warn":undefined}/>
    </div>
    <div className="timesheet-mode-note">
      <Status tone={view==="client"?"info":"warn"}>{view==="client"?"Клиентский вид":"Внутренний факт"}</Status>
      <span>{view==="client"?"Только согласуемые часы и коды присутствия. Ставки, начисления и внутренние корректировки скрыты.":"Рабочий табель менеджера. Ячейки можно вводить часами или кодами отсутствия."}</span>
      <span>Состояние периода: <strong>{statusLabel(data.status)}</strong></span>
      {message&&<span><strong>{message}</strong></span>}
    </div>
    <section className="section">
      <div className="section-head"><div><h2>{data.object} · {view==="client"?"клиентский табель":"внутренний табель"}</h2><p>{data.period}</p></div>{view==="client"&&<Status tone="info"><ShieldCheck size={12}/> без внутренних ставок</Status>}</div>
      <div className="timesheet-wrap">
        <table className="data-table timesheet">
          <thead><tr><th className="sticky-col">Сотрудник</th>{days.map(day=><th className={"day "+(isWeekend(data.month,day)?"weekend":"")} key={day}><span>{weekday(data.month,day)}</span>{day}</th>)}<th className="timesheet-total">Часы</th><th>Ночь</th><th>Переработка</th>{view==="internal"&&sensitive&&<><th className="timesheet-financial">Ставка</th><th className="timesheet-financial">Начислено</th></>}</tr></thead>
          <tbody>{visibleRows.map(row=><tr key={row.workerId}><td className="cell-title sticky-col">{row.name}</td>{days.map(day=>{const value=row.days?.[String(day)];const key=row.workerId+":"+day;return <td key={day} className={"day "+(isWeekend(data.month,day)?"weekend ":"")+(value===0?"day-zero":"")}>{canEdit&&view==="internal"?<input className="timesheet-cell-input" defaultValue={value==null?"":String(value)} disabled={saving===key} onBlur={e=>void saveCell(row.workerId,day,e.target.value)} aria-label={row.name+" "+day}/>:value==null?"—":value}</td>})}<td className="num timesheet-total">{row.visibleTotal}</td><td className="num">{row.night??0}</td><td className="num">{row.overtime??0}</td>{view==="internal"&&sensitive&&<><td className="num timesheet-financial">{row.rate?rub(row.rate):"—"}</td><td className="num timesheet-financial">{row.accrual?rub(row.accrual):"—"}</td></>}</tr>)}</tbody>
          <tfoot><tr><td className="sticky-col">Итого часов</td>{totals.map((value,index)=><td className={"day num "+(isWeekend(data.month,days[index])?"weekend":"")} key={days[index]}>{value||"—"}</td>)}<td className="num timesheet-total">{totalHours}</td><td className="num">{totalNight}</td><td className="num">{totalOvertime}</td>{view==="internal"&&sensitive&&<><td className="timesheet-financial">—</td><td className="num timesheet-financial">{rub(visibleRows.reduce((sum,row)=>sum+Number(row.accrual??0),0))}</td></>}</tr></tfoot>
        </table>
      </div>
    </section>
    <div className="summary-strip timesheet-legend"><strong>Обозначения:</strong><span>число — фактические часы</span><span>В — выходной</span><span>О — отпуск</span><span>МВ — межвахта</span><span>Б — больничный</span><span>НВ — невыход</span><span>— — данных нет</span></div>
  </>;
}
function range(start:number,end:number){return Array.from({length:end-start+1},(_,index)=>start+index)}
function dateFor(month:string,day:number){const [year,monthNumber]=month.split("-").map(Number);return new Date(Date.UTC(year,monthNumber-1,day))}
function isWeekend(month:string,day:number){const value=dateFor(month,day).getUTCDay();return value===0||value===6}
function weekday(month:string,day:number){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dateFor(month,day)).replace(".","")}
function numericCell(value:unknown){return typeof value==="number"?value:typeof value==="string"&&/^\d+(?:[.,]\d+)?$/.test(value)?Number(value.replace(",",".")):0}
function normalizeCell(value:string){const trimmed=value.trim().toUpperCase();if(trimmed==="")return null;if(/^\d+(?:[.,]\d+)?$/.test(trimmed))return Number(trimmed.replace(",","."));return trimmed}
function statusLabel(value:string){return value==="submitted"?"Передан на согласование":value==="approved"?"Согласован":value==="returned"?"Возвращён на корректировку":"Черновик"}
