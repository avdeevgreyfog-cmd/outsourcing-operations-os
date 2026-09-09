"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import * as XLSX from "xlsx";
import {CalendarClock,Columns3,Download,LayoutList,Plus,Search,X} from "lucide-react";
import type {TenderRow} from "@/lib/tenders/service";
import {tenderBillingLabels,tenderDeadlineState,tenderDecisionLabels,tenderResultLabels,tenderStageLabel,tenderStages} from "@/lib/tenders/model";
import {rub} from "@/lib/ui/format";
import {TenderImportPanel,type TenderImportRow,type TenderImportResult} from "@/components/TenderImportPanel";

type View="list"|"board";
type Bucket="active"|"completed";
type DeadlineFilter="all"|"today"|"3d"|"7d";
const DEMO_STORAGE="operis.demo.tenders.v1";

function formatDate(value:string|null){
  if(!value)return "—";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function deadlineClass(key:string){return key==="overdue"||key==="today"?"danger":key==="urgent"?"warn":"neutral";}
function activity(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))return "—";const diff=Math.floor((Date.now()-date.getTime())/86400000);return diff<=0?"Сегодня":diff===1?"Вчера":`${diff} дн. назад`;}
function isClientDemoRow(row:TenderRow){return row.id.startsWith("sample-user-")||row.id.startsWith("demo-local-");}
function uniqueKey(row:Pick<TenderRow,"platform"|"procedureNumber"|"sourceUrl"|"title"|"customer">){
  if(row.sourceUrl)return `url:${row.sourceUrl.toLowerCase()}`;
  if(row.platform&&row.procedureNumber)return `procedure:${row.platform.toLowerCase()}:${row.procedureNumber.toLowerCase()}`;
  return `fallback:${row.title.toLowerCase()}:${row.customer.toLowerCase()}`;
}
function toIso(value:string){if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();}
function toDemoRow(item:TenderImportRow):TenderRow{
  const now=new Date().toISOString();
  return {
    id:`demo-local-${crypto.randomUUID()}`,
    organizationId:"00000000-0000-4000-8000-000000000001",
    title:item.title,
    customer:item.customerName||"Заказчик не указан",
    clientId:null,
    platform:item.platform,
    procedureNumber:item.procedureNumber,
    sourceUrl:item.sourceUrl,
    sourceName:item.sourceName||"Демо · ручной ввод",
    publicationDate:item.publicationDate,
    submissionDeadline:item.submissionDeadline,
    initialPrice:item.initialPrice,
    billingUnit:"unknown",
    stage:"new",
    decision:"undecided",
    result:null,
    closeReason:null,
    priority:"normal",
    potential:"medium",
    analysisSummary:item.comment||null,
    nextActionText:"Изучить условия тендера",
    nextActionAt:null,
    owner:null,
    ownerUserId:null,
    createdByUserId:"10000000-0000-4000-8000-000000000002",
    teamId:null,
    regionId:null,
    legalEntityId:null,
    submittedAt:null,
    finalBidValue:null,
    updatedAt:now,
    createdAt:item.publicationDate||now,
    roleCount:0,
    requirementCount:0,
    readyRequirementCount:0,
    calculationCount:0,
    blockerCount:0,
  };
}

export function TendersWorkspace({rows,demo,canCreate,canImport,canEdit}:{rows:TenderRow[];demo:boolean;canCreate:boolean;canImport:boolean;canEdit:boolean}){
  const router=useRouter();
  const [items,setItems]=useState<TenderRow[]>(rows);
  const [view,setView]=useState<View>("list");
  const [bucket,setBucket]=useState<Bucket>("active");
  const [deadline,setDeadline]=useState<DeadlineFilter>("all");
  const [query,setQuery]=useState("");
  const [dragId,setDragId]=useState<string|null>(null);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [demoCreateOpen,setDemoCreateOpen]=useState(false);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      if(!demo){setItems(rows);return;}
      try{
        const stored=JSON.parse(window.localStorage.getItem(DEMO_STORAGE)||"[]") as TenderRow[];
        const valid=Array.isArray(stored)?stored.filter(item=>item&&typeof item.id==="string"&&item.id.startsWith("demo-local-")&&typeof item.title==="string"):[];
        const ids=new Set(valid.map(item=>item.id));
        setItems([...valid,...rows.filter(item=>!ids.has(item.id))]);
      }catch{setItems(rows);}
    },0);
    return()=>window.clearTimeout(timer);
  },[rows,demo]);

  function saveDemoLocal(next:TenderRow[]){
    if(!demo)return;
    const local=next.filter(row=>row.id.startsWith("demo-local-"));
    window.localStorage.setItem(DEMO_STORAGE,JSON.stringify(local));
  }

  function addDemoRows(imported:TenderImportRow[]):TenderImportResult{
    const keys=new Set(items.map(uniqueKey));
    const created:TenderRow[]=[];
    let skipped=0;
    for(const item of imported){
      const candidate=toDemoRow(item);const key=uniqueKey(candidate);
      if(keys.has(key)){skipped++;continue;}
      keys.add(key);created.push(candidate);
    }
    const next=[...created,...items];setItems(next);saveDemoLocal(next);
    return {imported:created.length,skipped};
  }

  const now=new Date();
  const activeRows=items.filter(row=>row.stage!=="completed");
  const urgent=activeRows.filter(row=>["overdue","today","urgent"].includes(tenderDeadlineState(row.submissionDeadline,now).key));
  const analysis=activeRows.filter(row=>["new","analysis","clarification"].includes(row.stage));
  const participating=activeRows.filter(row=>row.decision==="participate");

  const filtered=useMemo(()=>items
    .filter(row=>bucket==="completed"?row.stage==="completed":row.stage!=="completed")
    .filter(row=>{const normalized=query.trim().toLowerCase();return !normalized||[row.title,row.customer,row.platform??"",row.procedureNumber??"",row.owner??""].some(value=>value.toLowerCase().includes(normalized));})
    .filter(row=>{
      if(deadline==="all")return true;
      const state=tenderDeadlineState(row.submissionDeadline);
      if(deadline==="today")return ["overdue","today"].includes(state.key);
      if(deadline==="3d")return ["overdue","today","urgent"].includes(state.key);
      return state.days!=null&&state.days<=7;
    }),[items,bucket,query,deadline]);

  function exportExcel(){
    const data=filtered.map(row=>({
      "Название":row.title,
      "Заказчик":row.customer,
      "Площадка":row.platform??"",
      "Номер торга":row.procedureNumber??"",
      "Ссылка":row.sourceUrl??"",
      "Дата публикации":row.publicationDate?new Date(row.publicationDate).toLocaleDateString("ru-RU"):"",
      "Срок":row.submissionDeadline?new Date(row.submissionDeadline).toLocaleString("ru-RU"):"",
      "Цена в ₽":row.initialPrice==null?"":Number(row.initialPrice),
      "Этап":tenderStageLabel(row.stage),
      "Решение":tenderDecisionLabels[row.decision]??row.decision,
      "Ответственный":row.owner??"",
      "Следующее действие":row.nextActionText??"",
      "Источник":row.sourceName??"",
    }));
    const sheet=XLSX.utils.json_to_sheet(data);sheet["!cols"]=[{wch:48},{wch:28},{wch:20},{wch:20},{wch:48},{wch:18},{wch:22},{wch:16},{wch:18},{wch:18},{wch:24},{wch:34},{wch:26}];
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Тендеры");XLSX.writeFile(book,"OPERIS_тендеры.xlsx");
  }

  async function move(id:string,stage:string){
    if(!canEdit||stage==="completed"||id.startsWith("sample-user-")||id.startsWith("demo-local-"))return;
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

    {demo&&<div className="tender-demo-note"><strong>Демо-режим.</strong><span>В реестр добавлены примеры из вашей таблицы «Тендеры». Новые тендеры и импорт Excel в демо сохраняются только в этом браузере, чтобы можно было проверить сценарий без записи в рабочую базу.</span></div>}

    <div className="requests-toolbar tender-toolbar">
      <div className="segmented"><button className={bucket==="active"?"active":""} onClick={()=>setBucket("active")}>Активные</button><button className={bucket==="completed"?"active":""} onClick={()=>setBucket("completed")}>Завершённые</button></div>
      <div className="segmented"><button className={view==="list"?"active":""} onClick={()=>setView("list")}><LayoutList size={14}/> Список</button><button className={view==="board"?"active":""} onClick={()=>setView("board")}><Columns3 size={14}/> Доска</button></div>
      <label className="request-search"><Search size={14}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по тендерам"/></label>
      <select value={deadline} onChange={event=>setDeadline(event.target.value as DeadlineFilter)}><option value="all">Все сроки</option><option value="today">Сегодня / просрочено</option><option value="3d">До 3 дней</option><option value="7d">До 7 дней</option></select>
      <div className="toolbar-spacer"/>
      <button className="button" type="button" onClick={exportExcel}><Download size={14}/> Выгрузить Excel</button>
      {canImport&&<TenderImportPanel canImport={canImport} demo={demo} onDemoImport={addDemoRows}/>} 
      {canCreate&&(demo?<button className="button primary" type="button" onClick={()=>setDemoCreateOpen(true)}><Plus size={14}/> Добавить тендер</button>:<Link className="button primary" href="/tenders/new"><Plus size={14}/> Добавить тендер</Link>)}
    </div>

    {view==="list"?<TenderList rows={filtered}/>:<TenderBoard rows={filtered} bucket={bucket} canEdit={canEdit} busyId={busyId} dragId={dragId} setDragId={setDragId} onMove={move}/>} 
    {demo&&demoCreateOpen&&<DemoTenderCreateDrawer onClose={()=>setDemoCreateOpen(false)} onCreate={item=>{addDemoRows([item]);setDemoCreateOpen(false);}}/>}
  </div>;
}

function TenderTitle({row}:{row:TenderRow}){
  if(isClientDemoRow(row))return row.sourceUrl?<a href={row.sourceUrl} target="_blank" rel="noreferrer" className="cell-title">{row.title}</a>:<strong className="cell-title">{row.title}</strong>;
  return <Link href={`/tenders/${row.id}`} className="cell-title">{row.title}</Link>;
}

function TenderList({rows}:{rows:TenderRow[]}){
  return <div className="request-table-wrap"><table className="data-table request-registry-table tender-table"><thead><tr><th>Тендер</th><th>Заказчик</th><th>Подача до</th><th>Осталось</th><th>Этап</th><th>Блокеры</th><th>Ответственный</th><th>Активность</th></tr></thead><tbody>
    {rows.length?rows.map(row=>{const deadline=tenderDeadlineState(row.submissionDeadline);return <tr key={row.id}>
      <td><TenderTitle row={row}/><span className="cell-sub">{[row.platform,row.procedureNumber].filter(Boolean).join(" · ")||"Площадка не указана"}{row.initialPrice?` · ${rub(row.initialPrice)}`:""}</span></td>
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
    const stageItems=rows.filter(row=>row.stage===stage.code);
    return <section className="tender-board-column" key={stage.code} onDragOver={event=>{if(canEdit&&stage.code!=="completed")event.preventDefault();}} onDrop={()=>{if(dragId)void onMove(dragId,stage.code);setDragId(null);}}>
      <header><strong>{stage.label}</strong><span>{stageItems.length}</span></header>
      <div className="tender-board-stack">{stageItems.map(row=>{const state=tenderDeadlineState(row.submissionDeadline);const content=<><strong>{row.title}</strong><span>{row.customer}</span><div className="tender-card-meta"><span className={`tender-deadline ${deadlineClass(state.key)}`}>{state.label}</span><span>{formatDate(row.submissionDeadline)}</span></div>{row.nextActionText&&<small>{row.nextActionText}</small>}<footer><span>{row.owner??"Не назначен"}</span>{row.blockerCount>0&&<b>{row.blockerCount} блок.</b>}</footer></>;
        return <article key={row.id} draggable={canEdit&&!isClientDemoRow(row)&&row.stage!=="completed"} onDragStart={()=>setDragId(row.id)} onDragEnd={()=>setDragId(null)} className={busyId===row.id?"busy":""}>{isClientDemoRow(row)?(row.sourceUrl?<a href={row.sourceUrl} target="_blank" rel="noreferrer">{content}</a>:<div className="tender-board-static">{content}</div>):<Link href={`/tenders/${row.id}`}>{content}</Link>}</article>;
      })}{!stageItems.length&&<div className="tender-board-empty">Нет тендеров</div>}</div>
    </section>;
  })}</div>;
}

function DemoTenderCreateDrawer({onClose,onCreate}:{onClose:()=>void;onCreate:(item:TenderImportRow)=>void}){
  const [form,setForm]=useState({title:"",customerName:"",platform:"",procedureNumber:"",sourceUrl:"",publicationDate:"",submissionDeadline:"",initialPrice:"",comment:""});
  function update(key:keyof typeof form,value:string){setForm(current=>({...current,[key]:value}));}
  function submit(event:React.FormEvent){event.preventDefault();if(!form.title.trim())return;onCreate({title:form.title.trim(),customerName:form.customerName.trim()||null,platform:form.platform.trim()||null,procedureNumber:form.procedureNumber.trim()||null,sourceUrl:form.sourceUrl.trim()||null,publicationDate:form.publicationDate||null,submissionDeadline:toIso(form.submissionDeadline),initialPrice:form.initialPrice?Number(form.initialPrice):null,comment:form.comment.trim()||null,sourceName:"Демо · ручной ввод"});}
  return <div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="drawer tender-create-drawer"><div className="drawer-head"><div><strong>Добавить тендер</strong><span>Для регистрации достаточно названия. Остальное можно заполнить сразу или позже.</span></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={16}/></button></div><form onSubmit={submit}><div className="drawer-body"><div className="form-grid two"><label className="span-2"><span>Название тендера *</span><input autoFocus required value={form.title} onChange={event=>update("title",event.target.value)}/></label><label><span>Заказчик</span><input value={form.customerName} onChange={event=>update("customerName",event.target.value)}/></label><label><span>Площадка</span><input value={form.platform} onChange={event=>update("platform",event.target.value)} placeholder="ЕИС, B2B-Center, Bidzaar…"/></label><label><span>Номер торга</span><input value={form.procedureNumber} onChange={event=>update("procedureNumber",event.target.value)}/></label><label><span>Начальная цена, ₽</span><input type="number" min="0" value={form.initialPrice} onChange={event=>update("initialPrice",event.target.value)}/></label><label><span>Дата публикации</span><input type="date" value={form.publicationDate} onChange={event=>update("publicationDate",event.target.value)}/></label><label><span>Подача до</span><input type="datetime-local" value={form.submissionDeadline} onChange={event=>update("submissionDeadline",event.target.value)}/></label><label className="span-2"><span>Ссылка на закупку</span><input type="url" value={form.sourceUrl} onChange={event=>update("sourceUrl",event.target.value)}/></label><label className="span-2"><span>Комментарий</span><textarea rows={4} value={form.comment} onChange={event=>update("comment",event.target.value)}/></label></div><p className="tender-form-note">В демо-режиме запись сохраняется в локальном хранилище этого браузера. В рабочем режиме та же кнопка создаёт запись через API и PostgreSQL.</p></div><div className="drawer-footer"><button className="button" type="button" onClick={onClose}>Отмена</button><button className="button primary" type="submit" disabled={!form.title.trim()}>Добавить тендер</button></div></form></aside></div>;
}
