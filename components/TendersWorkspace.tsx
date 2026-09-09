"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {CalendarClock,Columns3,LayoutList,Plus,Search} from "lucide-react";
import type {TenderRow} from "@/lib/tenders/service";
import {tenderBillingLabels,tenderDeadlineState,tenderDecisionLabels,tenderResultLabels,tenderStageLabel,tenderStages} from "@/lib/tenders/model";
import {rub} from "@/lib/ui/format";
import {TenderImportPanel} from "@/components/TenderImportPanel";

type View="list"|"board";
type Bucket="active"|"completed";
type DeadlineFilter="all"|"today"|"3d"|"7d";

function formatDate(value:string|null){
  if(!value)return "—";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function deadlineClass(key:string){return key==="overdue"||key==="today"?"danger":key==="urgent"?"warn":"neutral";}
function activity(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))return "—";const diff=Math.floor((Date.now()-date.getTime())/86400000);return diff<=0?"Сегодня":diff===1?"Вчера":`${diff} дн. назад`;}

export function TendersWorkspace({rows,canCreate,canImport,canEdit}:{rows:TenderRow[];canCreate:boolean;canImport:boolean;canEdit:boolean}){
  const router=useRouter();
  const [view,setView]=useState<View>("list");
  const [bucket,setBucket]=useState<Bucket>("active");
  const [deadline,setDeadline]=useState<DeadlineFilter>("all");
  const [query,setQuery]=useState("");
  const [dragId,setDragId]=useState<string|null>(null);
  const [busyId,setBusyId]=useState<string|null>(null);
  const now=new Date();
  const activeRows=rows.filter(row=>row.stage!=="completed");
  const urgent=activeRows.filter(row=>["overdue","today","urgent"].includes(tenderDeadlineState(row.submissionDeadline,now).key));
  const analysis=activeRows.filter(row=>["new","analysis","clarification"].includes(row.stage));
  const participating=activeRows.filter(row=>row.decision==="participate");

  const filtered=useMemo(()=>rows
    .filter(row=>bucket==="completed"?row.stage==="completed":row.stage!=="completed")
    .filter(row=>{const normalized=query.trim().toLowerCase();return !normalized||[row.title,row.customer,row.platform??"",row.procedureNumber??"",row.owner??""].some(value=>value.toLowerCase().includes(normalized));})
    .filter(row=>{
      if(deadline==="all")return true;
      const state=tenderDeadlineState(row.submissionDeadline);
      if(deadline==="today")return ["overdue","today"].includes(state.key);
      if(deadline==="3d")return ["overdue","today","urgent"].includes(state.key);
      return state.days!=null&&state.days<=7;
    }),[rows,bucket,query,deadline]);

  async function move(id:string,stage:string){
    if(!canEdit||stage==="completed")return;
    setBusyId(id);
    try{
      const response=await fetch(`/api/tenders/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"stage",stage})});
      if(!response.ok){const json=await response.json().catch(()=>({}));throw new Error(json.error??"Не удалось изменить этап");}
      router.refresh();
    }catch(error){window.alert(error instanceof Error?error.message:"Не удалось изменить этап");}
    finally{setBusyId(null);}
  }

  return <div className="request-baseline-registry tender-registry">
    <div className="request-final-command-strip tender-command-strip">
      <div><span>В работе</span><strong>{activeRows.length}</strong><small>активных тендеров</small></div>
      <div><span>Требуют анализа</span><strong>{analysis.length}</strong><small>новые и уточнения</small></div>
      <div><span>Участвуем</span><strong>{participating.length}</strong><small>решение принято</small></div>
      <div className={urgent.length?"attention":""}><span>Срок ≤ 3 дней</span><strong>{urgent.length}</strong><small>требуют внимания</small></div>
    </div>

    <div className="requests-toolbar tender-toolbar">
      <div className="segmented"><button className={bucket==="active"?"active":""} onClick={()=>setBucket("active")}>Активные</button><button className={bucket==="completed"?"active":""} onClick={()=>setBucket("completed")}>Завершённые</button></div>
      <div className="segmented"><button className={view==="list"?"active":""} onClick={()=>setView("list")}><LayoutList size={14}/> Список</button><button className={view==="board"?"active":""} onClick={()=>setView("board")}><Columns3 size={14}/> Доска</button></div>
      <label className="request-search"><Search size={14}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по тендерам"/></label>
      <select value={deadline} onChange={event=>setDeadline(event.target.value as DeadlineFilter)}><option value="all">Все сроки</option><option value="today">Сегодня / просрочено</option><option value="3d">До 3 дней</option><option value="7d">До 7 дней</option></select>
      <div className="toolbar-spacer"/>
      {canImport&&<TenderImportPanel canImport={canImport}/>} 
      {canCreate&&<Link className="button primary" href="/tenders/new"><Plus size={14}/> Новый тендер</Link>}
    </div>

    {view==="list"?<TenderList rows={filtered}/>:<TenderBoard rows={filtered} bucket={bucket} canEdit={canEdit} busyId={busyId} dragId={dragId} setDragId={setDragId} onMove={move}/>} 
  </div>;
}

function TenderList({rows}:{rows:TenderRow[]}){
  return <div className="request-table-wrap"><table className="data-table request-registry-table tender-table"><thead><tr><th>Тендер</th><th>Заказчик</th><th>Подача до</th><th>Осталось</th><th>Этап</th><th>Блокеры</th><th>Ответственный</th><th>Активность</th></tr></thead><tbody>
    {rows.length?rows.map(row=>{const deadline=tenderDeadlineState(row.submissionDeadline);return <tr key={row.id}>
      <td><Link href={`/tenders/${row.id}`} className="cell-title">{row.title}</Link><span className="cell-sub">{[row.platform,row.procedureNumber].filter(Boolean).join(" · ")||"Площадка не указана"}{row.initialPrice?` · ${rub(row.initialPrice)}`:""}</span></td>
      <td>{row.customer}<span className="cell-sub">{row.sourceName??"Источник не указан"}</span></td>
      <td><strong>{formatDate(row.submissionDeadline)}</strong><span className="cell-sub">{row.billingUnit!=="unknown"?tenderBillingLabels[row.billingUnit]:"Формат цены не определён"}</span></td>
      <td><span className={`tender-deadline ${deadlineClass(deadline.key)}`}><CalendarClock size={13}/>{deadline.label}</span></td>
      <td><span className="status status-neutral"><i/>{row.stage==="completed"?(row.result?tenderResultLabels[row.result]:"Завершён"):tenderStageLabel(row.stage)}</span><span className="cell-sub">{tenderDecisionLabels[row.decision]}</span></td>
      <td>{row.blockerCount>0?<><strong className="tender-blocker-count">{row.blockerCount}</strong><span className="cell-sub">по документам</span></>:"—"}</td>
      <td>{row.owner??"Не назначен"}<span className="cell-sub">{row.nextActionText??"Нет следующего действия"}</span></td>
      <td>{activity(row.updatedAt)}</td>
    </tr>}):<tr><td colSpan={8}><div className="commercial-empty">По выбранным фильтрам тендеров нет</div></td></tr>}
  </tbody></table></div>;
}

function TenderBoard({rows,bucket,canEdit,busyId,dragId,setDragId,onMove}:{rows:TenderRow[];bucket:Bucket;canEdit:boolean;busyId:string|null;dragId:string|null;setDragId:(id:string|null)=>void;onMove:(id:string,stage:string)=>Promise<void>}){
  const stages=tenderStages.filter(stage=>bucket==="completed"?stage.code==="completed":stage.code!=="completed");
  return <div className="tender-board">{stages.map(stage=>{
    const items=rows.filter(row=>row.stage===stage.code);
    return <section className="tender-board-column" key={stage.code} onDragOver={event=>{if(canEdit&&stage.code!=="completed")event.preventDefault();}} onDrop={()=>{if(dragId)void onMove(dragId,stage.code);setDragId(null);}}>
      <header><strong>{stage.label}</strong><span>{items.length}</span></header>
      <div className="tender-board-stack">{items.map(row=>{const deadline=tenderDeadlineState(row.submissionDeadline);return <article key={row.id} draggable={canEdit&&row.stage!=="completed"} onDragStart={()=>setDragId(row.id)} onDragEnd={()=>setDragId(null)} className={busyId===row.id?"busy":""}>
        <Link href={`/tenders/${row.id}`}><strong>{row.title}</strong><span>{row.customer}</span><div className="tender-card-meta"><span className={`tender-deadline ${deadlineClass(deadline.key)}`}>{deadline.label}</span><span>{formatDate(row.submissionDeadline)}</span></div>{row.nextActionText&&<small>{row.nextActionText}</small>}<footer><span>{row.owner??"Не назначен"}</span>{row.blockerCount>0&&<b>{row.blockerCount} блок.</b>}</footer></Link>
      </article>})}{!items.length&&<div className="tender-board-empty">Нет тендеров</div>}</div>
    </section>;
  })}</div>;
}
