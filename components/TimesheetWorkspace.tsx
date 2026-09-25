"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Printer, RotateCcw, Send, ShieldCheck, WalletCards } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { TimesheetData, TimesheetWorkerRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";

type Mode="first"|"second"|"month";
type View="client"|"internal";

export function TimesheetWorkspace({data,options,sensitive,canEdit,canSubmit,canReview,canApproveClient,canClose,embedded=false}:{data:TimesheetData;options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;canSubmit:boolean;canReview:boolean;canApproveClient:boolean;canClose:boolean;embedded?:boolean}){
  const router=useRouter();
  const [mode,setMode]=useState<Mode>("month");
  const [view,setView]=useState<View>(sensitive?"internal":"client");
  const [rows,setRows]=useState<TimesheetWorkerRow[]>(data.rows);
  const [saving,setSaving]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [comment,setComment]=useState("");
  const [bulkBusy,setBulkBusy]=useState(false);
  const todayIso=new Date().toISOString().slice(0,10);
  const currentDay=data.month===todayIso.slice(0,7)?Number(todayIso.slice(8,10)):null;
  const lastDay=Number(data.periodEnd.slice(8,10));
  const allDays=useMemo(()=>range(1,lastDay),[lastDay]);
  const days=mode==="first"?allDays.filter(day=>day<=15):mode==="second"?allDays.filter(day=>day>=16):allDays;
  const visibleRows=rows.map(row=>({...row,visibleTotal:days.reduce((sum,day)=>sum+numericCell(row.days?.[String(day)]),0)}));
  const totals=days.map(day=>visibleRows.reduce((sum,row)=>sum+numericCell(row.days?.[String(day)]),0));
  const totalHours=visibleRows.reduce((sum,row)=>sum+row.visibleTotal,0);
  const totalNight=visibleRows.reduce((sum,row)=>sum+Number(row.night??0),0);
  const totalOvertime=visibleRows.reduce((sum,row)=>sum+Number(row.overtime??0),0);
  const internal=data.internalSnapshot;
  const client=data.clientSnapshot;
  const locked=internal?.status==="internal_submitted"||internal?.status==="internal_checked"||internal?.status==="closed"||client?.status==="client_sent"||client?.status==="client_approved"||client?.status==="closed";
  const canEditFact=canEdit&&view==="internal"&&!locked;

  function changeContext(objectId:string,month:string){
    const params=new URLSearchParams();if(!embedded&&objectId)params.set("object",objectId);if(month)params.set("month",month);
    router.push(embedded?`/objects/${data.objectId}?tab=timesheets&${params.toString()}`:"/timesheets?"+params.toString());
  }
  async function persistCell(workerId:string,day:number,value:string,quiet=false){
    const row=rows.find(item=>item.workerId===workerId);if(!canEditFact||row?.rowKind==="candidate")return false;
    const key=workerId+":"+day;if(!quiet){setSaving(key);setMessage("");}
    try{
      const workDate=data.month+"-"+String(day).padStart(2,"0");
      const response=await fetch("/api/timesheets/entries",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workerId,objectId:data.objectId,workDate,value})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить");
      setRows(current=>current.map(item=>item.workerId===workerId?{...item,days:{...(item.days??{}),[String(day)]:normalizeCell(value)}}:item));
      if(!quiet)setMessage("Изменение сохранено");return true;
    }catch(e){if(!quiet)setMessage(e instanceof Error?e.message:"Не удалось сохранить");return false;}
    finally{if(!quiet)setSaving("");}
  }
  async function saveCell(workerId:string,day:number,value:string){await persistCell(workerId,day,value)}
  async function bulkToday(action:"confirm"|"hours"){
    if(!currentDay||!canEditFact)return;setBulkBusy(true);setMessage("");
    try{
      const targets=rows.filter(row=>row.rowKind!=="candidate"&&(action==="confirm"?row.days?.[String(currentDay)]==="П":row.days?.[String(currentDay)]==="?"&&Number(row.plannedHours??0)>0));
      let done=0;for(const row of targets){const value=action==="confirm"?"?":String(row.plannedHours);if(await persistCell(row.workerId,currentDay,value,true))done++;}
      setMessage(action==="confirm"?`Подтверждён выход: ${done}`:`Нормативные часы заполнены: ${done}`);
    }finally{setBulkBusy(false);}
  }
  async function workflow(action:"submit_internal"|"review_internal"|"return_internal"|"send_client"|"client_approve"|"client_return"|"close"){
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/timesheets/workflow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action,objectId:data.objectId,periodStart:data.periodStart,periodEnd:data.periodEnd,comment:comment||null,
      })});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось выполнить действие");
      const labels:Record<string,string>={
        submit_internal:"Табель передан на внутреннюю проверку",
        review_internal:"Внутренний табель проверен",
        return_internal:"Табель возвращён менеджеру",
        send_client:"Клиентская версия зафиксирована и отправлена",
        client_approve:"Подтверждение клиента зафиксировано",
        client_return:"Возврат клиента зафиксирован",
        close:"Период закрыт: начисления и фактическая экономика сформированы",
      };
      setMessage(labels[action]??"Готово");setComment("");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось выполнить действие");}
    finally{setBusy(false);}
  }
  async function exportExcel(){
    const header=["Сотрудник",...days.map(day=>String(day).padStart(2,"0")+"."+data.month.slice(5,7)),"Часы",...(view==="internal"&&sensitive?["Ставка","Начислено"]:[])];
    const body=visibleRows.map(row=>[row.name,...days.map(day=>row.days?.[String(day)]??""),row.visibleTotal,...(view==="internal"&&sensitive?[row.rate??"",row.accrual??""]:[])]);
    const XLSX=await import("xlsx");const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([header,...body]);XLSX.utils.book_append_sheet(wb,ws,"Табель");
    XLSX.writeFile(wb,`Табель_${data.object}_${data.month}_${view==="client"?"согласование":"полный"}.xlsx`);
  }

  return <>
    <div className="scheduler-controls">
      <div className="page-actions">
        {!embedded&&<select value={data.objectId} onChange={e=>changeContext(e.target.value,data.month)} aria-label="Объект">{options.objects.map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select>}
        <input type="month" value={data.month} onChange={e=>changeContext(data.objectId,e.target.value)} aria-label="Месяц"/>
        <div className="segmented">{(["first","second","month"] as Mode[]).map(value=><button type="button" key={value} className={mode===value?"active":""} onClick={()=>setMode(value)}>{value==="first"?"1–15":value==="second"?"16–конец":"Весь месяц"}</button>)}</div>
      </div>
      <div className="page-actions">
        <div className="segmented"><button type="button" className={view==="client"?"active":""} onClick={()=>setView("client")}>Клиентский</button>{sensitive&&<button type="button" className={view==="internal"?"active":""} onClick={()=>setView("internal")}>Внутренний</button>}</div>
        <button className="button" type="button" onClick={()=>void exportExcel()}><Download size={14}/> Excel</button>
        {view==="client"&&<button className="button" type="button" onClick={()=>window.print()}><Printer size={14}/> Печать</button>}
        {view==="internal"&&currentDay&&canEditFact&&<><button className="button" type="button" disabled={bulkBusy} onClick={()=>void bulkToday("confirm")}>Подтвердить выходы</button><button className="button" type="button" disabled={bulkBusy} onClick={()=>void bulkToday("hours")}>Заполнить нормативные часы</button></>}
      </div>
    </div>
    <div className="timesheet-summary">
      <Metric label="Сотрудники" value={visibleRows.length} note="в текущем периоде"/>
      <Metric label="Факт" value={totalHours+" ч"} note={mode==="month"?"за месяц":"за выбранную половину"}/>
      <Metric label="Ночные" value={totalNight+" ч"}/>
      <Metric label="Переработка" value={totalOvertime+" ч"} tone={totalOvertime>0?"warn":undefined}/>
    </div>
    {currentDay&&view==="internal"&&<div className="timesheet-mobile-today"><div className="timesheet-mobile-head"><strong>Сегодня · {String(currentDay).padStart(2,"0")}.{data.month.slice(5,7)}</strong><span>План и быстрый факт</span></div>{visibleRows.map(row=>{const value=row.days?.[String(currentDay)]??"—";return <div className="timesheet-mobile-row" key={row.workerId}><div><strong>{row.name}</strong><small>{row.specialty??(row.rowKind==="candidate"?"Кандидат":"Сотрудник")}</small></div><b>{String(value)}</b>{row.rowKind==="candidate"?<span>Выход согласован</span>:canEditFact?<div className="timesheet-mobile-actions"><button onClick={()=>void persistCell(row.workerId,currentDay,"?")}>Вышел</button><button onClick={()=>void persistCell(row.workerId,currentDay,"НВ")}>НВ</button><button onClick={()=>void persistCell(row.workerId,currentDay,"В")}>В</button>{Number(row.plannedHours??0)>0&&<button onClick={()=>void persistCell(row.workerId,currentDay,String(row.plannedHours))}>{row.plannedHours} ч</button>}</div>:<span>Только просмотр</span>}</div>})}</div>}
    <div className="timesheet-mode-note">
      <Status tone={view==="client"?"info":"warn"}>{view==="client"?"Клиентский вид":"Внутренний факт"}</Status>
      <span>{view==="client"?"Только согласуемые часы и коды присутствия. Ставки, начисления и внутренние корректировки скрыты.":"Рабочий табель менеджера. Ячейки можно вводить часами или кодами отсутствия."}</span>
      <span>Состояние периода: <strong>{statusLabel(data.status)}</strong></span><span>Внутренняя версия: <strong>{internal?`v${internal.version} · ${statusLabel(internal.status)}`:"не создана"}</strong></span><span>Клиентская версия: <strong>{client?`v${client.version} · ${statusLabel(client.status)}`:"не создана"}</strong></span>
      {message&&<span><strong>{message}</strong></span>}
    </div>
    <section className="section">
      <div className="section-head"><div><h2>Маршрут табеля</h2><p>Версии сохраняются отдельно: отправленная клиенту версия не перезаписывается.</p></div><Status tone={client?.status==="closed"?"good":client?.status==="client_sent"?"warn":internal?.status==="internal_submitted"?"warn":"neutral"}>{statusLabel(data.status)}</Status></div>
      <div className="timesheet-workflow-panel">
        <input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Комментарий к передаче или возврату" aria-label="Комментарий к действию"/>
        <div className="page-actions">
          {canSubmit&&(!internal||["draft","returned"].includes(internal.status))&&<button className="button primary" disabled={busy} onClick={()=>void workflow("submit_internal")}><Send size={14}/> На внутреннюю проверку</button>}
          {canReview&&internal?.status==="internal_submitted"&&<><button className="button primary" disabled={busy} onClick={()=>void workflow("review_internal")}><CheckCircle2 size={14}/> Проверено</button><button className="button" disabled={busy} onClick={()=>void workflow("return_internal")}><RotateCcw size={14}/> Вернуть менеджеру</button></>}
          {canSubmit&&internal?.status==="internal_checked"&&(!client||client.status==="returned")&&<button className="button primary" disabled={busy} onClick={()=>void workflow("send_client")}><Send size={14}/> Отправить клиенту</button>}
          {canApproveClient&&client?.status==="client_sent"&&<><button className="button primary" disabled={busy} onClick={()=>void workflow("client_approve")}><CheckCircle2 size={14}/> Клиент согласовал</button><button className="button" disabled={busy} onClick={()=>void workflow("client_return")}><RotateCcw size={14}/> Клиент вернул</button></>}
          {canClose&&client?.status==="client_approved"&&<button className="button primary" disabled={busy} onClick={()=>void workflow("close")}><WalletCards size={14}/> Закрыть период</button>}
          {client?.status==="closed"&&<span className="cell-sub">Период закрыт. Изменения факта заблокированы.</span>}
        </div>
      </div>
    </section>
    <section className="section">
      <div className="section-head"><div><h2>{data.object} · {view==="client"?"клиентский табель":"внутренний табель"}</h2><p>{data.period}</p></div>{view==="client"&&<Status tone="info"><ShieldCheck size={12}/> без внутренних ставок</Status>}</div>
      <div className="timesheet-wrap">
        <table className="data-table timesheet">
          <thead><tr><th className="sticky-col">Сотрудник</th>{days.map(day=><th className={"day "+(isWeekend(data.month,day)?"weekend":"")} key={day}><span>{weekday(data.month,day)}</span>{day}</th>)}<th className="timesheet-total">Часы</th><th>Ночь</th><th>Переработка</th>{view==="internal"&&sensitive&&<><th className="timesheet-financial">Ставка</th><th className="timesheet-financial">Начислено</th></>}</tr></thead>
          <tbody>{visibleRows.map(row=><tr key={row.workerId} className={row.rowKind==="candidate"?"timesheet-candidate-row":""}><td className="cell-title sticky-col">{row.name}{row.rowKind==="candidate"&&<span className="cell-sub">Кандидат · {row.specialty??"первый выход"}</span>}</td>{days.map(day=>{const value=row.days?.[String(day)];const key=row.workerId+":"+day;const shift=row.plannedShiftKinds?.[String(day)];const title=shift?`План · ${shift==="day"?"дневная":shift==="night"?"ночная":"день / ночь"} смена`:undefined;const editable=canEditFact&&row.rowKind!=="candidate";return <td key={day} title={title} className={"day "+(isWeekend(data.month,day)?"weekend ":"")+(value===0?"day-zero ":"")+(value==="П"?"day-planned ":"")}>{editable?<input className="timesheet-cell-input" defaultValue={value==null?"":String(value)} disabled={saving===key} onBlur={e=>void saveCell(row.workerId,day,e.target.value)} aria-label={row.name+" "+day}/>:value==null?"—":value}</td>})}<td className="num timesheet-total">{row.visibleTotal}</td><td className="num">{row.night??0}</td><td className="num">{row.overtime??0}</td>{view==="internal"&&sensitive&&<><td className="num timesheet-financial">{row.rate?rub(row.rate):"—"}</td><td className="num timesheet-financial">{row.accrual?rub(row.accrual):"—"}</td></>}</tr>)}</tbody>
          <tfoot><tr><td className="sticky-col">Итого часов</td>{totals.map((value,index)=><td className={"day num "+(isWeekend(data.month,days[index])?"weekend":"")} key={days[index]}>{value||"—"}</td>)}<td className="num timesheet-total">{totalHours}</td><td className="num">{totalNight}</td><td className="num">{totalOvertime}</td>{view==="internal"&&sensitive&&<><td className="timesheet-financial">—</td><td className="num timesheet-financial">{rub(visibleRows.reduce((sum,row)=>sum+Number(row.accrual??0),0))}</td></>}</tr></tfoot>
        </table>
      </div>
    </section>
    <div className="summary-strip timesheet-legend"><strong>Обозначения:</strong><span>П — плановый выход</span><span>? — вышел, часы не подтверждены</span><span>число — фактические часы</span><span>В — выходной</span><span>О — отпуск</span><span>МВ — межвахта</span><span>Б — больничный</span><span>НВ — невыход</span><span>— — данных нет</span></div>
  </>;
}
function range(start:number,end:number){return Array.from({length:end-start+1},(_,index)=>start+index)}
function dateFor(month:string,day:number){const [year,monthNumber]=month.split("-").map(Number);return new Date(Date.UTC(year,monthNumber-1,day))}
function isWeekend(month:string,day:number){const value=dateFor(month,day).getUTCDay();return value===0||value===6}
function weekday(month:string,day:number){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dateFor(month,day)).replace(".","")}
function numericCell(value:unknown){return typeof value==="number"?value:typeof value==="string"&&/^\d+(?:[.,]\d+)?$/.test(value)?Number(value.replace(",",".")):0}
function normalizeCell(value:string){const trimmed=value.trim().toUpperCase();if(trimmed==="")return null;if(/^\d+(?:[.,]\d+)?$/.test(trimmed))return Number(trimmed.replace(",","."));return trimmed}
function statusLabel(value:string){const labels:Record<string,string>={draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён на корректировку",internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт"};return labels[value]??value}