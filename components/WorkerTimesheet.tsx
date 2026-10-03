"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
import type {PersonalTimesheet} from "@/lib/operations/worker-timesheet";
import {validTimesheetMonth,timesheetHours} from "@/lib/operations/worker-timesheet.mjs";
import {Empty} from "@/components/UI";
const codes:Record<string,string>={"П":"Плановая смена","?":"Выход подтверждён, часы не закрыты","В":"Выходной","МВ":"Межвахта","О":"Отпуск","Б":"Больничный","НВ":"Невыход","УВ":"Работа завершена"};
function shiftMonth(month:string,delta:number){const [year,n]=month.split("-").map(Number);return new Date(Date.UTC(year,n-1+delta,1)).toISOString().slice(0,7)}
export function WorkerTimesheet({workerId,initialData,staticDemo=false}:{workerId:string;initialData:PersonalTimesheet;staticDemo?:boolean}){
 const [remoteData,setData]=useState(initialData),[month,setMonth]=useState(initialData.month),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{if(month===initialData.month&&retry===0)return;if(staticDemo)return;const controller=new AbortController();
  void fetch(`/api/workers/${workerId}/timesheet?month=${month}`,{signal:controller.signal}).then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error??"Не удалось загрузить табель");if(!controller.signal.aborted)setData(json)}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Не удалось загрузить табель")});return()=>controller.abort();
 },[workerId,month,initialData,staticDemo,retry]);
 const data=month===initialData.month?initialData:remoteData;
 const loading=data.month!==month&&!error;const [year,n]=month.split("-").map(Number);const days=Array.from({length:new Date(Date.UTC(year,n,0)).getUTCDate()},(_,index)=>index+1);
 const period=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(month+"-01T00:00:00Z"));
 return <section className="section worker-personal-timesheet" aria-label="Личный табель"><div className="section-head"><div><h2>Личный табель</h2><p>Факт и план из табелей объектов. {period}</p></div><div className="worker-month-controls"><button className="icon-button" aria-label="Предыдущий месяц" disabled={staticDemo||!validTimesheetMonth(shiftMonth(month,-1))} onClick={()=>{setError("");setMonth(shiftMonth(month,-1))}}><ChevronLeft size={16}/></button><input type="month" aria-label="Месяц личного табеля" min="2000-01" max="2099-12" value={month} disabled={staticDemo} onChange={event=>{if(validTimesheetMonth(event.target.value)){setError("");setMonth(event.target.value)}}}/><button className="icon-button" aria-label="Следующий месяц" disabled={staticDemo||!validTimesheetMonth(shiftMonth(month,1))} onClick={()=>{setError("");setMonth(shiftMonth(month,1))}}><ChevronRight size={16}/></button></div></div>
  {staticDemo&&<p className="worker-timesheet-notice">Статическое демо показывает текущий месяц. Выбор периода доступен в приложении.</p>}
  {loading?<p className="worker-timesheet-notice" role="status">Загружаю табель…</p>:error?<div className="worker-timesheet-notice" role="alert">{error} <button className="button" onClick={()=>{setError("");setRetry(retry+1)}}>Повторить</button></div>:<>
    <div className="worker-timesheet-summary"><div><span>Отработано смен</span><strong>{data.summary.shifts}</strong></div><div><span>Фактические часы</span><strong>{data.summary.hours}</strong></div><div><span>День / ночь</span><strong>{data.summary.dayShifts} / {data.summary.nightShifts}</strong></div><div><span>Дней с выходом</span><strong>{data.summary.workedDays}</strong></div></div>
    {data.objects.length?<><div className="worker-month-grid-wrap"><table className="worker-month-grid"><thead><tr><th>Объект / смена</th>{days.map(day=>{const d=new Date(Date.UTC(year,n-1,day));const weekend=[0,6].includes(d.getUTCDay());return <th key={day} className={weekend?"is-weekend":""}>{day}<small>{new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(d)}</small></th>})}<th>Смен</th><th>Часов</th></tr></thead><tbody>{data.objects.flatMap(object=>["day","night"].map(segment=>{
       const merged:Record<string,number|string|null>={};for(const row of object.rows)for(const [day,value] of Object.entries(segment==="day"?row.dayCells:row.nightCells)){if(!(day in merged)||timesheetHours(value)>timesheetHours(merged[day]))merged[day]=value}
       const count=days.filter(day=>timesheetHours(merged[String(day)])>0).length,total=days.reduce((sum,day)=>sum+timesheetHours(merged[String(day)]),0);
       return <tr key={object.objectId+segment}><th><Link href={`/timesheets?object=${object.objectId}&month=${month}`}>{object.object}</Link><small>{segment==="day"?"День":"Ночь"}</small></th>{days.map(day=>{const value=merged[String(day)];const hours=timesheetHours(value);return <td key={day} className={hours?"is-worked":value==="НВ"?"is-absent":""} title={hours?`${hours} фактических часов`:typeof value==="string"?codes[value]??value:"Нет отметки"}>{value??"—"}</td>})}<td className="num">{count}</td><td className="num">{Number(total.toFixed(2))}</td></tr>
     }))}</tbody></table></div><div className="worker-timesheet-object-links">{data.objects.map(object=><Link key={object.objectId} className="button" href={`/timesheets?object=${object.objectId}&month=${month}`}>Табель объекта · {object.object}</Link>)}</div></>:<Empty title="Отметок за месяц нет" text="В доступных табелях объектов сотрудник за этот период не найден."/>}
  </>}
  <details className="worker-timesheet-legend"><summary>Обозначения табеля</summary><div>Число — фактические часы. {Object.entries(codes).map(([code,label])=><span key={code}><b>{code}</b> — {label}</span>)}<span>Пустая отметка не считается невыходом. День и ночь считаются отдельно, как в табеле объекта.</span></div></details>
 </section>;
}
