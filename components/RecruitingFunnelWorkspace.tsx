"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RecruitingActionDrawer } from "@/components/RecruitingActionDrawer";
import { RecruitingCandidateCreateModal } from "@/components/RecruitingCandidateCreateModal";
import { RecruitingPipelineSettings } from "@/components/RecruitingPipelineSettings";
import { useRecruitingApplications } from "@/lib/recruiting/demo-client";
import { displayRecruitingStage, formatWorkDate, isActiveStage, needsTransitionDetails, workRisks, type RecruitingDisplayStage } from "@/lib/recruiting/workflow";
import { saveApplicationChange } from "@/lib/recruiting/client-actions";
import type { RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions, RecruitingPipelineStage } from "@/lib/recruiting/service";
import { recruitingStageLabels, type RecruitingStage } from "@/lib/recruiting/model";

type Props={
  rows:RecruitingApplicationRow[];
  needs:RecruitingNeedRow[];
  options:RecruitingOptions;
  pipeline:RecruitingPipelineStage[];
  demo:boolean;
  canCreate:boolean;
  canEdit:boolean;
  canConvert:boolean;
  canConfigurePipeline:boolean;
  canConfigureSources:boolean;
  showResponsible:boolean;
  currentUserId:string;
  initialNeed?:string|null;
  initialObject?:string|null;
  initialSpecialty?:string|null;
  initialRecruiter?:string|null;
  initialSource?:string|null;
  initialQueue?:string;
  initialStage?:string;
};

const terminalLabels:Record<string,string>={rejected:"Отказ / не подходит",no_show:"Не вышел",reserve:"Резерв"};

export function RecruitingFunnelWorkspace({
  rows,needs,options,pipeline:initialPipeline,demo,canCreate,canEdit,canConvert,canConfigurePipeline,canConfigureSources,showResponsible,currentUserId,
  initialQueue,initialStage,initialNeed,initialObject,initialSpecialty,initialRecruiter,initialSource,
}:Props){
  const router=useRouter();
  const [pipeline,setPipeline]=useState(initialPipeline);
  const [query,setQuery]=useState("");
  const [needFilter,setNeedFilter]=useState(initialNeed??"all");
  const [objectFilter,setObjectFilter]=useState(initialObject??"all");
  const [specialtyFilter,setSpecialtyFilter]=useState(initialSpecialty??"all");
  const [recruiterFilter,setRecruiterFilter]=useState(initialRecruiter??"all");
  const [sourceFilter,setSourceFilter]=useState(initialSource??"all");
  const [stageFilter,setStageFilter]=useState(initialStage??"all");
  const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [targetStage,setTargetStage]=useState<RecruitingStage|undefined>();
  const [dragged,setDragged]=useState<string|null>(null);
  const [queue,setQueue]=useState(initialQueue??"active");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    const params=new URLSearchParams();
    if(needFilter!=="all")params.set("need",needFilter);
    if(objectFilter!=="all")params.set("object",objectFilter);
    if(specialtyFilter!=="all")params.set("specialty",specialtyFilter);
    if(recruiterFilter!=="all")params.set("recruiter",recruiterFilter);
    if(sourceFilter!=="all")params.set("source",sourceFilter);
    if(stageFilter!=="all")params.set("stage",stageFilter);
    if(queue!=="active")params.set("queue",queue);
    const qs=params.toString();
    router.replace(qs?`/recruiting?${qs}`:"/recruiting",{scroll:false});
  },[needFilter,objectFilter,specialtyFilter,recruiterFilter,sourceFilter,queue,stageFilter,router]);

  const allRows=useRecruitingApplications(rows,demo);
  const needById=useMemo(()=>new Map(needs.map(item=>[item.id,item])),[needs]);
  const objectOptions=useMemo(()=>Array.from(new Map(needs.filter(item=>item.objectId&&item.object).map(item=>[item.objectId!,item.object!])).entries()),[needs]);
  const specialtyOptions=useMemo(()=>Array.from(new Map(needs.map(item=>[item.specialtyId,item.specialty])).entries()),[needs]);
  const recruiterOptions=useMemo(()=>Array.from(new Map(options.responsibles.map(item=>[item.id,item.name])).entries()),[options.responsibles]);
  const sourceOptions=options.sourceCatalog.map(item=>item.name);

  const filtered=useMemo(()=>allRows.filter(row=>{
    const need=needById.get(row.needId);
    const display=displayRecruitingStage(row);
    if(stageFilter!=="all"&&row.stage!==stageFilter&&display!==stageFilter)return false;
    if(needFilter!=="all"&&row.needId!==needFilter)return false;
    if(objectFilter!=="all"&&row.objectId!==objectFilter)return false;
    if(specialtyFilter!=="all"&&need?.specialtyId!==specialtyFilter)return false;
    if(recruiterFilter!=="all"&&row.responsibleUserId!==recruiterFilter&&!row.assigneeUserIds.includes(recruiterFilter))return false;
    if(sourceFilter!=="all"&&row.source!==sourceFilter)return false;
    if(!query.trim())return true;
    return `${row.fullName} ${row.phone??""} ${row.need} ${row.object??""} ${row.source??""} ${row.responsible??""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"));
  }),[allRows,needById,needFilter,objectFilter,specialtyFilter,recruiterFilter,sourceFilter,query,stageFilter]);

  const scoped=filtered.filter(row=>{
    if(queue==="reserve")return row.stage==="reserve";
    if(queue==="closed")return ["rejected","no_show"].includes(row.stage);
    if(queue==="attention")return !["rejected","no_show"].includes(row.stage)&&workRisks(row).length>0;
    if(queue==="today")return !["rejected","no_show"].includes(row.stage)&&Boolean(row.nextActionAt&&new Date(row.nextActionAt).toDateString()===new Date().toDateString());
    if(queue==="missing")return isActiveStage(row.stage)&&!row.nextActionAt;
    return !["rejected","no_show","reserve"].includes(row.stage);
  });

  const displayStage=(row:RecruitingApplicationRow)=>displayRecruitingStage(row);
  const stageLabel=(stage:string)=>pipeline.find(item=>item.stageCode===stage)?.label??terminalLabels[stage]??recruitingStageLabels[stage as RecruitingStage]??stage;
  const configuredColumns=useMemo(()=>{
    if(queue==="reserve")return [{stageCode:"reserve",label:"Резерв",virtual:false}] as Array<Pick<RecruitingPipelineStage,"stageCode"|"label"|"virtual">>;
    if(queue==="closed")return [{stageCode:"rejected",label:terminalLabels.rejected,virtual:false},{stageCode:"no_show",label:terminalLabels.no_show,virtual:false}];
    const used=new Set(scoped.map(row=>displayStage(row)));
    return pipeline.filter(item=>item.active||used.has(item.stageCode as RecruitingDisplayStage)).map(item=>({stageCode:item.stageCode,label:item.label,virtual:item.virtual}));
  },[pipeline,queue,scoped]);

  const hasContext=needFilter!=="all"||objectFilter!=="all"||specialtyFilter!=="all"||recruiterFilter!=="all"||sourceFilter!=="all";
  const documentsCount=filtered.filter(row=>displayStage(row)==="interview").length;
  const preparationCount=filtered.filter(row=>["preparation","ready"].includes(displayStage(row))).length;
  const retained30=filtered.filter(row=>displayStage(row)==="retention_30").length;

  async function drop(stageCode:string){
    const target=pipeline.find(item=>item.stageCode===stageCode);
    if(target?.virtual)return;
    const row=allRows.find(item=>item.applicationId===dragged);
    setDragged(null);
    const stage=stageCode as RecruitingStage;
    if(!row||row.stage===stage||!canEdit||busy)return;
    if(needsTransitionDetails(row.stage,stage)){setTargetStage(stage);setSelected(row);return;}
    setBusy(row.applicationId);setError("");
    try{await saveApplicationChange(row,{stage},demo);router.refresh();}
    catch(value){setError(value instanceof Error?value.message:"Не удалось переместить кандидата");}
    finally{setBusy("");}
  }

  return <div className="recruiting-workspace">
    <div className="recruiting-summary">
      <div><span>В работе</span><strong>{filtered.filter(row=>!["rejected","no_show","reserve"].includes(row.stage)).length}</strong></div>
      <div><span>Документы</span><strong>{documentsCount}</strong></div>
      <div><span>Подготовка к выходу</span><strong>{preparationCount}</strong></div>
      <div><span>30 дней</span><strong>{retained30}</strong></div>
    </div>

    {hasContext&&<div className="recruiting-filter-context"><div><strong>Воронка отфильтрована из потребностей</strong><span>{needFilter!=="all"?(needById.get(needFilter)?.title??"Потребность"):objectFilter!=="all"?(objectOptions.find(([id])=>id===objectFilter)?.[1]??"Объект"):"Выбранный контур"}</span></div><Link className="button" href="/needs">← Потребности</Link></div>}

    <div className="recruiting-toolbar">
      <div className="recruiting-toolbar-left recruiting-funnel-filters">
        <select className="request-search" value={needFilter} onChange={event=>setNeedFilter(event.target.value)}><option value="all">Все потребности</option>{needs.filter(item=>["open","in_progress","paused"].includes(item.status)).map(item=><option key={item.id} value={item.id}>{item.title} · {item.object??item.region??"без объекта"}</option>)}</select>
        <select className="request-search" value={objectFilter} onChange={event=>setObjectFilter(event.target.value)}><option value="all">Все объекты</option>{objectOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={specialtyFilter} onChange={event=>setSpecialtyFilter(event.target.value)}><option value="all">Все специальности</option>{specialtyOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={recruiterFilter} onChange={event=>setRecruiterFilter(event.target.value)}><option value="all">Все ответственные</option>{recruiterOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)}><option value="all">Все источники</option>{sourceOptions.map(source=><option key={source} value={source}>{source}</option>)}</select>
      </div>
      <div className="recruiting-toolbar-actions">
        <input className="request-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Кандидат, телефон, объект, источник"/>
        <RecruitingPipelineSettings stages={pipeline} canConfigure={canConfigurePipeline} demo={demo} onSaved={setPipeline}/>
        {canCreate&&<button className="button primary" onClick={()=>setShowCreate(true)}>+ Добавить кандидата</button>}
      </div>
    </div>

    {error&&<div className="recruiting-error">{error}</div>}
    {demo&&<p className="cell-sub">Учебные записи. Изменения демо сохраняются в этом браузере.</p>}

    <div className="recruiting-toolbar" role="group" aria-label="Рабочая очередь">
      <div className="recruiting-toolbar-left">{[["active","В работе"],["attention","Требуют действия"],["today","На сегодня"],["missing","Без действия"],["reserve","Резерв"],["closed","Завершённые"]].map(([value,label])=><button key={value} className={`button ${queue===value?"active":""}`} aria-pressed={queue===value} onClick={()=>setQueue(value)}>{label}</button>)}</div>
      <div className="recruiting-toolbar-actions"><Link className="button" href="/needs?view=analytics">Аналитика</Link><Link className="button" href="/candidates">Список кандидатов</Link></div>
    </div>

    <div className="recruiting-funnel-scroll">
      <div className="recruiting-funnel recruiting-funnel-compact" style={{gridTemplateColumns:`repeat(${configuredColumns.length}, minmax(190px, 1fr))`,minWidth:configuredColumns.length*200-10}}>
        {configuredColumns.map(column=>{
          const items=scoped.filter(row=>displayStage(row)===column.stageCode).sort((a,b)=>(a.nextActionAt??"9999").localeCompare(b.nextActionAt??"9999"));
          return <section className={`recruiting-column${dragged&&!column.virtual?" is-drop-target":""}`} key={column.stageCode} onDragOver={event=>{if(canEdit&&!column.virtual)event.preventDefault()}} onDrop={event=>{event.preventDefault();void drop(column.stageCode)}}>
            <header><span>{column.label}</span><span>{items.length}</span></header>
            <div className="recruiting-cards">
              {items.map(row=><CompactCandidateCard key={row.applicationId} row={row} displayStage={displayStage(row)} showResponsible={showResponsible&&row.responsibleUserId!==currentUserId} draggable={canEdit&&!column.virtual&&row.stage!=="started"&&!busy} onDragStart={()=>setDragged(row.applicationId)} onDragEnd={()=>setDragged(null)} onClick={()=>{setTargetStage(undefined);setSelected(row)}}/>)}
              {!items.length&&<div className="empty-inline">Нет кандидатов</div>}
            </div>
          </section>;
        })}
      </div>
    </div>

    {selected&&<RecruitingActionDrawer key={selected.applicationId+String(targetStage)} row={selected} need={needById.get(selected.needId)} pipeline={pipeline} options={options} initialStage={targetStage} demo={demo} canEdit={canEdit} canConvert={canConvert} showResponsible={showResponsible} onClose={()=>setSelected(null)}/>}
    {showCreate&&<RecruitingCandidateCreateModal needs={needs} options={options} rows={allRows} initialNeed={needFilter==="all"?null:needFilter} demo={demo} canConfigureSources={canConfigureSources} onClose={()=>setShowCreate(false)} onCreated={()=>router.refresh()}/>}
  </div>;
}

function CompactCandidateCard({row,displayStage,showResponsible,draggable,onDragStart,onDragEnd,onClick}:{row:RecruitingApplicationRow;displayStage:RecruitingDisplayStage;showResponsible:boolean;draggable:boolean;onDragStart:()=>void;onDragEnd:()=>void;onClick:()=>void}){
  const risk=workRisks(row)[0];
  const days=row.actualStartAt&&Number.isFinite(Date.parse(row.actualStartAt))?Math.max(0,Math.floor((Date.now()-Date.parse(row.actualStartAt))/86400000)):0;
  const travelLabels:Record<string,string>={not_required:"Логистика не требуется",planning:"Логистика планируется",ticket_required:"Нужно купить билет",ticket_purchased:"Билет куплен",travelling:"В пути",arrived:"Прибыл"};
  return <button className={`recruiting-card recruiting-card-compact${risk?" is-overdue":""}`} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}>
    <div className="recruiting-card-title"><strong>{row.fullName}</strong>{row.nextActionAt&&<time>{formatWorkDate(row.nextActionAt).split(",").pop()?.trim()}</time>}</div>
    <span className="recruiting-card-role">{row.need}{row.object?` · ${row.object}`:""}</span>
    {displayStage==="new"&&<><span>{row.phone??row.email??"Контакт не указан"}</span><span className="recruiting-card-muted">{[row.source,row.city].filter(Boolean).join(" · ")||"Источник не указан"}</span></>}
    {displayStage==="contact"&&<><span>{row.workflow?.lastContact??"Первичный разговор ещё не зафиксирован"}</span><span className="recruiting-card-muted">{row.workflow?.nextActionText??"Следующее действие не назначено"}</span></>}
    {displayStage==="interview"&&<><span>Документы <strong>{row.documentsReceived} / {row.documentsRequired||"—"}</strong></span><span className="recruiting-card-muted">{row.workflow?.lastContact??"Ожидается сбор документов"}</span></>}
    {["manager_review","approved"].includes(displayStage)&&<span>{row.workflow?.reviewRecipient?`Решение: ${row.workflow.reviewRecipient}`:"Ожидается решение"}</span>}
    {["preparation","ready"].includes(displayStage)&&<><span>Выход: <strong>{row.plannedStartDate??"не назначен"}</strong>{row.workflow?.plannedShift?` · ${row.workflow.plannedShift}`:""}</span><span className="recruiting-card-muted">{travelLabels[row.workflow?.travelStatus??"planning"]??"Логистика"}</span></>}
    {["started","retention_7","retention_30"].includes(displayStage)&&<><span>Первый выход: <strong>{row.actualStartAt?new Date(row.actualStartAt).toLocaleDateString("ru-RU"):"—"}</strong></span><span className="recruiting-card-muted">Работает {days} дн.</span></>}
    {displayStage==="reserve"&&<span>{row.workflow?.reserveReason??"Причина резерва не указана"}</span>}
    {["rejected","no_show"].includes(displayStage)&&<span>{row.rejectionReason??"Причина завершения не указана"}</span>}
    <div className="recruiting-card-footer">{showResponsible&&<span>{row.responsible??row.owner??"Не назначен"}</span>}{risk&&<span className="needs-overdue">{risk}</span>}</div>
  </button>;
}
