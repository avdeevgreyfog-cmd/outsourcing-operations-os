"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, X } from "lucide-react";
import { RecruitingActionDrawer } from "./RecruitingActionDrawer";
import { useRecruitingApplications, saveDemoApplication } from "@/lib/recruiting/demo-client";
import { isActiveStage, needsTransitionDetails, workRisks, formatWorkDate } from "@/lib/recruiting/workflow";
import { saveApplicationChange } from "@/lib/recruiting/client-actions";
import type { RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions, RecruitingFunnelStageSetting, RecruitingSourceOption } from "@/lib/recruiting/service";
import { recruitingStageLabels, recruitingStages, type RecruitingStage } from "@/lib/recruiting/model";

type Props={
  rows:RecruitingApplicationRow[];
  needs:RecruitingNeedRow[];
  options:RecruitingOptions;
  demo:boolean;
  canCreate:boolean;
  canEdit:boolean;
  canConvert:boolean;
  canConfigurePipeline:boolean;
  canManageSources:boolean;
  initialNeed?:string|null;
  initialObject?:string|null;
  initialSpecialty?:string|null;
  initialRecruiter?:string|null;
  initialSource?:string|null;
  initialQueue?:string;
  initialStage?:string;
};
type ContactKind="telegram"|"whatsapp"|"email";
type ExtraContact={kind:ContactKind;value:string};
type CandidateForm={
  needId:string;
  fullName:string;
  phone:string;
  preferredChannel:string;
  city:string;
  source:string;
  sourceChannel:string;
  sourceCampaign:string;
  sourceReference:string;
  nextAction:string;
};
const blank:CandidateForm={needId:"",fullName:"",phone:"",preferredChannel:"phone",city:"",source:"",sourceChannel:"",sourceCampaign:"",sourceReference:"",nextAction:""};

const sourceKindLabels:Record<string,string>={
  job_site:"Работный сайт",social:"Соцсеть",referral:"Рекомендация",partner:"Партнёр",offline:"Оффлайн",internal:"Внутренний",other:"Другое",
};

export function RecruitingFunnelWorkspace({
  rows,needs,options,demo,canCreate,canEdit,canConvert,canConfigurePipeline,canManageSources,
  initialQueue,initialStage,initialNeed,initialObject,initialSpecialty,initialRecruiter,initialSource,
}:Props){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [needFilter,setNeedFilter]=useState(initialNeed??"all");
  const [objectFilter,setObjectFilter]=useState(initialObject??"all");
  const [specialtyFilter,setSpecialtyFilter]=useState(initialSpecialty??"all");
  const [recruiterFilter,setRecruiterFilter]=useState(initialRecruiter??"all");
  const [sourceFilter,setSourceFilter]=useState(initialSource??"all");
  const [stageFilter,setStageFilter]=useState(initialStage??"all");
  const [queue,setQueue]=useState(initialQueue??"active");
  const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
  const [targetStage,setTargetStage]=useState<RecruitingStage|undefined>();
  const [dragged,setDragged]=useState<string|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [showStageSettings,setShowStageSettings]=useState(false);
  const [form,setForm]=useState<CandidateForm>({...blank,needId:initialNeed??"",source:options.sourceCatalog[0]?.name??""});
  const [contacts,setContacts]=useState<ExtraContact[]>([]);
  const [localSources,setLocalSources]=useState<RecruitingSourceOption[]>(options.sourceCatalog);
  const [newSourceName,setNewSourceName]=useState("");
  const [newSourceKind,setNewSourceKind]=useState("partner");
  const [showSourceCreate,setShowSourceCreate]=useState(false);
  const [stageSettings,setStageSettings]=useState<RecruitingFunnelStageSetting[]>(options.funnelStages);
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

  useEffect(()=>setLocalSources(options.sourceCatalog),[options.sourceCatalog]);
  useEffect(()=>setStageSettings(options.funnelStages),[options.funnelStages]);

  const allRows=useRecruitingApplications(rows,demo);
  const needById=useMemo(()=>new Map(needs.map(item=>[item.id,item])),[needs]);
  const stageLabelByCode=useMemo(()=>new Map(options.funnelStages.map(item=>[item.code,item.label])),[options.funnelStages]);
  const objectOptions=useMemo(()=>Array.from(new Map(needs.filter(item=>item.objectId&&item.object).map(item=>[item.objectId!,item.object!])).entries()),[needs]);
  const specialtyOptions=useMemo(()=>Array.from(new Map(needs.map(item=>[item.specialtyId,item.specialty])).entries()),[needs]);
  const recruiterOptions=useMemo(()=>Array.from(new Map(needs.flatMap(item=>item.recruiters.map(recruiter=>[recruiter.userId,recruiter.name] as const))).entries()),[needs]);
  const sourceOptions=useMemo(()=>[...new Set([...localSources.map(x=>x.name),...allRows.map(row=>row.source).filter((value):value is string=>Boolean(value))])].sort((a,b)=>a.localeCompare(b,"ru")),[allRows,localSources]);

  const filtered=useMemo(()=>allRows.filter(row=>{
    const need=needById.get(row.needId);
    if(stageFilter!=="all"&&row.stage!==stageFilter)return false;
    if(needFilter!=="all"&&row.needId!==needFilter)return false;
    if(objectFilter!=="all"&&row.objectId!==objectFilter)return false;
    if(specialtyFilter!=="all"&&need?.specialtyId!==specialtyFilter)return false;
    if(recruiterFilter!=="all"&&!row.assigneeUserIds.includes(recruiterFilter)&&row.ownerUserId!==recruiterFilter)return false;
    if(sourceFilter!=="all"&&row.source!==sourceFilter)return false;
    if(!query.trim())return true;
    return `${row.fullName} ${row.phone??""} ${row.need} ${row.object??""} ${row.source??""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"));
  }),[allRows,needById,needFilter,objectFilter,specialtyFilter,recruiterFilter,sourceFilter,query,stageFilter]);

  const scoped=filtered.filter(row=>
    queue==="reserve"?row.stage==="reserve":
    queue==="closed"?["rejected","no_show"].includes(row.stage):
    queue==="attention"?workRisks(row).length>0:
    queue==="today"?Boolean(row.nextActionAt&&new Date(row.nextActionAt).toDateString()===new Date().toDateString()):
    queue==="missing"?["new","interview","documents","preparation"].includes(row.stage)&&!row.nextActionAt:
    isActiveStage(row.stage)
  );
  const hasContext=needFilter!=="all"||objectFilter!=="all"||specialtyFilter!=="all"||recruiterFilter!=="all"||sourceFilter!=="all";
  const activeStages=options.funnelStages.filter(x=>x.active).sort((a,b)=>a.sortOrder-b.sortOrder);
  const boardStages:RecruitingStage[]=queue==="reserve"?["reserve"]:queue==="closed"?["rejected","no_show"]:activeStages.map(x=>x.code);
  const selectedNeed=form.needId?needById.get(form.needId):undefined;

  async function drop(stage:RecruitingStage){
    const row=allRows.find(x=>x.applicationId===dragged);
    setDragged(null);
    if(!row||row.stage===stage||!canEdit||busy)return;
    if(needsTransitionDetails(row.stage,stage)){setTargetStage(stage);setSelected(row);return;}
    setBusy(row.applicationId);setError("");
    try{await saveApplicationChange(row,{stage},demo);router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"Не удалось переместить");}
    finally{setBusy("");}
  }

  async function createCandidate(event:React.FormEvent){
    event.preventDefault();setError("");
    const need=needs.find(item=>item.id===form.needId);
    if(!need){setError("Выберите потребность");return;}
    if(!form.phone){setError("Укажите телефон кандидата");return;}
    const telegram=contacts.find(x=>x.kind==="telegram")?.value??"";
    const whatsapp=contacts.find(x=>x.kind==="whatsapp")?.value??"";
    const email=contacts.find(x=>x.kind==="email")?.value??"";
    setBusy("create");
    try{
      if(demo){
        const stage:RecruitingStage="new";
        const created:RecruitingApplicationRow={
          applicationId:crypto.randomUUID(),
          candidateId:allRows.find(x=>x.phone?.replace(/\D/g,"")===form.phone.replace(/\D/g,""))?.candidateId??crypto.randomUUID(),
          organizationId:need.organizationId,fullName:form.fullName||"Без имени",phone:form.phone,email:email||null,
          preferredChannel:form.preferredChannel||"phone",telegram:telegram||null,whatsapp:whatsapp||null,city:form.city||null,
          source:form.source||"Ручной ввод",sourceChannel:form.sourceChannel||null,sourceCampaign:form.sourceCampaign||null,sourceReference:form.sourceReference||null,
          stage,stageLabel:stageLabelByCode.get(stage)??recruitingStageLabels[stage],needId:need.id,need:need.title,objectId:need.objectId,object:need.object,
          regionId:need.regionId,clientId:need.clientId,ownerUserId:need.ownerUserId,owner:need.owner,managerUserId:need.managerUserId,manager:need.manager,
          assigneeUserIds:need.assigneeUserIds,nextAction:form.nextAction||null,plannedStartDate:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,
          conditions:need.conditions,workflow:{nextActionText:"Провести первичное интервью"},recentCommunications:[],documentSummary:{required:0,received:0,missing:[]},
        };
        if(allRows.some(x=>x.candidateId===created.candidateId&&x.needId===created.needId))throw new Error("У кандидата уже есть заявка на эту потребность");
        const now=new Date().toISOString();created.createdAt=now;created.updatedAt=now;created.stageEnteredAt=now;created.nextActionAt=form.nextAction?new Date(form.nextAction).toISOString():null;created.stageEvents=[{toStage:"new",createdAt:now}];
        saveDemoApplication(created);
      }else{
        const response=await fetch("/api/candidates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          fullName:form.fullName||"Без имени",phone:form.phone,email:email||null,preferredChannel:form.preferredChannel||"phone",
          telegram:telegram||null,whatsapp:whatsapp||null,city:form.city||null,source:form.source||null,sourceChannel:form.sourceChannel||null,
          sourceCampaign:form.sourceCampaign||null,sourceReference:form.sourceReference||null,needId:form.needId,nextActionAt:form.nextAction?new Date(form.nextAction).toISOString():null,
        })});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось добавить кандидата");
        router.refresh();
      }
      setShowCreate(false);setContacts([]);setForm({...blank,needId:needFilter==="all"?"":needFilter,source:localSources[0]?.name??""});
    }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить кандидата");}
    finally{setBusy("");}
  }

  async function addSource(){
    if(!newSourceName.trim())return;
    if(demo){
      const item={id:`demo-${crypto.randomUUID()}`,code:`custom-${Date.now()}`,name:newSourceName.trim(),kind:newSourceKind,active:true};
      setLocalSources(current=>[...current,item]);setForm(current=>({...current,source:item.name}));
      setNewSourceName("");setShowSourceCreate(false);return;
    }
    setBusy("source");
    try{
      const response=await fetch("/api/recruiting/sources",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:newSourceName,kind:newSourceKind})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error??"Не удалось добавить источник");
      setLocalSources(current=>[...current,json]);setForm(current=>({...current,source:json.name}));setNewSourceName("");setShowSourceCreate(false);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить источник");}
    finally{setBusy("");}
  }

  async function saveStageSettings(){
    setBusy("stages");setError("");
    try{
      if(demo){setShowStageSettings(false);return;}
      const response=await fetch("/api/recruiting/funnel-stages",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({stages:stageSettings.map((x,index)=>({code:x.code,label:x.label,sortOrder:(index+1)*10,active:x.active}))})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить этапы");
      setShowStageSettings(false);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить этапы");}
    finally{setBusy("");}
  }

  function moveStage(index:number,direction:-1|1){
    setStageSettings(current=>{
      const next=[...current];const target=index+direction;if(target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];return next;
    });
  }

  return <div className="recruiting-workspace">
    <div className="recruiting-summary">
      <div><span>В работе</span><strong>{filtered.filter(x=>isActiveStage(x.stage)).length}</strong></div>
      <div><span>Интервью</span><strong>{filtered.filter(x=>x.stage==="interview").length}</strong></div>
      <div><span>Подготовка</span><strong>{filtered.filter(x=>x.stage==="preparation").length}</strong></div>
      <div><span>Первый выход</span><strong>{filtered.filter(x=>["first_shift","retention_7","retention_30"].includes(x.stage)).length}</strong></div>
    </div>

    {hasContext&&<div className="recruiting-filter-context"><div><strong>Воронка отфильтрована из потребностей</strong><span>{needFilter!=="all"?(needById.get(needFilter)?.title??"Потребность"):objectFilter!=="all"?(objectOptions.find(([id])=>id===objectFilter)?.[1]??"Объект"):"Выбранный контур"}</span></div><Link className="button" href="/needs">← Потребности</Link></div>}

    <div className="recruiting-toolbar">
      <div className="recruiting-toolbar-left recruiting-funnel-filters">
        <select className="request-search" value={needFilter} onChange={e=>setNeedFilter(e.target.value)}><option value="all">Все потребности</option>{needs.filter(x=>["open","in_progress","paused"].includes(x.status)).map(x=><option key={x.id} value={x.id}>{x.title} · {x.object??x.region??"без объекта"}</option>)}</select>
        <select className="request-search" value={objectFilter} onChange={e=>setObjectFilter(e.target.value)}><option value="all">Все объекты</option>{objectOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={specialtyFilter} onChange={e=>setSpecialtyFilter(e.target.value)}><option value="all">Все специальности</option>{specialtyOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={recruiterFilter} onChange={e=>setRecruiterFilter(e.target.value)}><option value="all">Все рекрутеры</option>{recruiterOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select className="request-search" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">Все источники</option>{sourceOptions.map(source=><option key={source} value={source}>{source}</option>)}</select>
      </div>
      <div className="recruiting-toolbar-actions">
        <input className="request-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Кандидат, телефон, объект, источник"/>
        {canConfigurePipeline&&<button className="button" onClick={()=>setShowStageSettings(true)}><Settings2 size={14}/> Настроить воронку</button>}
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
      <div className="recruiting-funnel recruiting-funnel-compact" style={{gridTemplateColumns:`repeat(${boardStages.length}, minmax(190px, 1fr))`,minWidth:boardStages.length*200-10}}>
        {boardStages.map(stage=><section className={`recruiting-column${dragged?" is-drop-target":""}`} key={stage} onDragOver={e=>{if(canEdit)e.preventDefault();}} onDrop={e=>{e.preventDefault();void drop(stage);}}>
          <header><span>{stageLabelByCode.get(stage)??recruitingStageLabels[stage]}</span><span>{scoped.filter(x=>x.stage===stage).length}</span></header>
          <div className="recruiting-cards">
            {scoped.filter(x=>x.stage===stage).sort((a,b)=>(a.nextActionAt??"9999").localeCompare(b.nextActionAt??"9999")).map(row=>
              <CompactCandidateCard key={row.applicationId} row={row} showOwner={canConfigurePipeline} busy={Boolean(busy)} draggable={canEdit&&!busy&&!["retention_30"].includes(row.stage)} onDragStart={()=>setDragged(row.applicationId)} onDragEnd={()=>setDragged(null)} onOpen={()=>{setTargetStage(undefined);setSelected(row);}}/>
            )}
            {!scoped.some(x=>x.stage===stage)&&<div className="empty-inline">Нет кандидатов</div>}
          </div>
        </section>)}
      </div>
    </div>

    {selected&&<RecruitingActionDrawer
      key={selected.applicationId+String(targetStage)}
      row={selected}
      need={needById.get(selected.needId)??null}
      stages={activeStages}
      recruiters={options.recruiters}
      initialStage={targetStage}
      demo={demo}
      canEdit={canEdit}
      canConvert={canConvert}
      exitReasons={options.exitReasons}
      onClose={()=>setSelected(null)}
      onSaved={()=>router.refresh()}
    />}

    {showCreate&&<div className="recruiting-modal" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}>
      <form className="recruiting-modal-card recruiting-candidate-create" onSubmit={createCandidate}>
        <div className="recruiting-modal-head"><div><h2>Добавить кандидата</h2><p>Быстрый ввод во время звонка. Условия выбранной потребности всегда перед глазами.</p></div><button className="icon-button" type="button" onClick={()=>setShowCreate(false)}><X size={17}/></button></div>
        <div className="candidate-create-layout">
          <div className="recruiting-form candidate-create-form">
            <label>Потребность<select required value={form.needId} onChange={e=>setForm(x=>({...x,needId:e.target.value}))}><option value="">Выберите потребность</option>{needs.filter(x=>["open","in_progress"].includes(x.status)).map(x=><option key={x.id} value={x.id}>{x.title} · {x.object??x.region??"без объекта"} · найти {x.toRecruit}</option>)}</select></label>
            <div className="candidate-create-grid"><label>Имя / ФИО<input value={form.fullName} onChange={e=>setForm(x=>({...x,fullName:e.target.value}))} placeholder="Можно заполнить после начала разговора"/></label><label>Телефон<input required value={form.phone} onChange={e=>setForm(x=>({...x,phone:e.target.value}))}/></label><label>Город<input value={form.city} onChange={e=>setForm(x=>({...x,city:e.target.value}))}/></label><label>Предпочтительный способ связи<select value={form.preferredChannel} onChange={e=>setForm(x=>({...x,preferredChannel:e.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label></div>

            <div className="candidate-contact-list">
              {contacts.map((contact,index)=><div className="candidate-contact-row" key={index}><select value={contact.kind} onChange={e=>setContacts(current=>current.map((x,i)=>i===index?{...x,kind:e.target.value as ContactKind}:x))}><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select><input value={contact.value} onChange={e=>setContacts(current=>current.map((x,i)=>i===index?{...x,value:e.target.value}:x))} placeholder={contact.kind==="telegram"?"@username или номер":contact.kind==="email"?"email":"Номер"}/><button className="icon-button" type="button" onClick={()=>setContacts(current=>current.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}
              <button className="button candidate-add-contact" type="button" onClick={()=>setContacts(current=>[...current,{kind:"telegram",value:""}])}><Plus size={13}/> Добавить контакт</button>
            </div>

            <div className="candidate-source-block">
              <label>Источник<select value={form.source} onChange={e=>setForm(x=>({...x,source:e.target.value}))}><option value="">Не указан</option>{localSources.filter(x=>x.active).map(source=><option key={source.id} value={source.name}>{source.name} · {sourceKindLabels[source.kind]??source.kind}</option>)}</select></label>
              {canManageSources&&<button className="button" type="button" onClick={()=>setShowSourceCreate(x=>!x)}>+ Источник</button>}
            </div>
            {showSourceCreate&&<div className="candidate-source-create"><input value={newSourceName} onChange={e=>setNewSourceName(e.target.value)} placeholder="Например, ООО «Регион Персонал»"/><select value={newSourceKind} onChange={e=>setNewSourceKind(e.target.value)}>{Object.entries(sourceKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="button" type="button" disabled={busy==="source"} onClick={addSource}>Сохранить источник</button></div>}
            <details className="candidate-source-details"><summary>Детали источника</summary><div className="candidate-create-grid"><label>Канал / площадка<input value={form.sourceChannel} onChange={e=>setForm(x=>({...x,sourceChannel:e.target.value}))}/></label><label>Кампания / объявление<input value={form.sourceCampaign} onChange={e=>setForm(x=>({...x,sourceCampaign:e.target.value}))}/></label><label className="wide">Ссылка / идентификатор<input value={form.sourceReference} onChange={e=>setForm(x=>({...x,sourceReference:e.target.value}))}/></label></div></details>
            <label>Первое следующее действие<input type="datetime-local" value={form.nextAction} onChange={e=>setForm(x=>({...x,nextAction:e.target.value}))}/></label>
          </div>
          <NeedCallCheatSheet need={selectedNeed??null}/>
        </div>
        <div className="recruiting-form-actions"><button type="button" className="button" onClick={()=>setShowCreate(false)}>Отмена</button><button className="button primary" disabled={busy==="create"}>{busy==="create"?"Сохраняю…":"Добавить кандидата"}</button></div>
      </form>
    </div>}

    {showStageSettings&&<div className="recruiting-modal" onMouseDown={e=>{if(e.target===e.currentTarget)setShowStageSettings(false)}}>
      <div className="recruiting-modal-card recruiting-stage-settings">
        <div className="recruiting-modal-head"><div><h2>Настройка воронки</h2><p>Название можно менять под терминологию компании. Системный смысл этапа сохраняется для аналитики и автоматизаций.</p></div><button className="icon-button" onClick={()=>setShowStageSettings(false)}><X size={17}/></button></div>
        <div className="stage-settings-list">{stageSettings.map((stage,index)=><div className="stage-settings-row" key={stage.code}><span className="stage-settings-index">{index+1}</span><input value={stage.label} onChange={e=>setStageSettings(current=>current.map(x=>x.code===stage.code?{...x,label:e.target.value}:x))}/><small>{stage.code}</small><label><input type="checkbox" checked={stage.active} disabled={stage.code==="new"||stage.code==="first_shift"} onChange={e=>setStageSettings(current=>current.map(x=>x.code===stage.code?{...x,active:e.target.checked}:x))}/> Показывать</label><div><button className="icon-button" type="button" disabled={index===0} onClick={()=>moveStage(index,-1)}>↑</button><button className="icon-button" type="button" disabled={index===stageSettings.length-1} onClick={()=>moveStage(index,1)}>↓</button></div></div>)}</div>
        <div className="recruiting-form-actions"><button className="button" type="button" onClick={()=>setShowStageSettings(false)}>Отмена</button><button className="button primary" type="button" disabled={busy==="stages"} onClick={saveStageSettings}>{busy==="stages"?"Сохраняю…":"Сохранить настройку"}</button></div>
      </div>
    </div>}
  </div>;
}

function CompactCandidateCard({row,showOwner,busy,draggable,onDragStart,onDragEnd,onOpen}:{row:RecruitingApplicationRow;showOwner:boolean;busy:boolean;draggable:boolean;onDragStart:()=>void;onDragEnd:()=>void;onOpen:()=>void}){
  const risk=workRisks(row)[0];
  const docs=row.documentSummary;
  const days=row.actualStartAt?Math.max(0,Math.floor((Date.now()-Date.parse(row.actualStartAt))/(24*60*60*1000))):0;
  let middle:React.ReactNode;
  if(row.stage==="new")middle=<><span>{row.phone??row.email??"Контакт не указан"}</span><span>{[row.source,row.city].filter(Boolean).join(" · ")||"Источник не указан"}</span></>;
  else if(row.stage==="interview")middle=<><span>{row.workflow?.lastContact||"Интервью ещё не зафиксировано"}</span><span>{row.workflow?.nextActionText||"Уточнить интерес и условия"}</span></>;
  else if(row.stage==="documents")middle=<><span>Документы: <b>{docs?.received??row.workflow?.documentsReceived??0}/{docs?.required??row.workflow?.documentsRequired??0}</b></span><span>{docs?.missing?.length?`Нет: ${docs.missing.slice(0,2).join(", ")}`:row.workflow?.missingDocuments?.length?`Нет: ${row.workflow.missingDocuments.slice(0,2).join(", ")}`:"Чек-лист не заполнен"}</span></>;
  else if(row.stage==="preparation")middle=<><span>План выхода: <b>{row.plannedStartDate??"не назначен"}</b></span><span>{travelLabel(row.workflow?.travelState)}</span></>;
  else if(row.stage==="first_shift")middle=<><span>Первый выход: <b>{row.actualStartAt?formatWorkDate(row.actualStartAt):"ожидается"}</b></span><span>{row.workflow?.plannedShift||"Смена не указана"}</span></>;
  else if(row.stage==="retention_7"||row.stage==="retention_30")middle=<><span>Работает: <b>{days} дн.</b></span><span>Первый выход: {row.actualStartAt?formatWorkDate(row.actualStartAt):"—"}</span></>;
  else middle=<><span>{row.rejectionReason??"Заявка завершена"}</span><span>{row.object??row.need}</span></>;
  return <button type="button" draggable={draggable&&!busy} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`recruiting-card recruiting-card-compact${risk?" is-overdue":""}`} onClick={onOpen}>
    <div className="recruiting-card-title"><strong>{row.fullName}</strong>{row.nextActionAt&&<time>{formatWorkDate(row.nextActionAt)}</time>}</div>
    <span className="recruiting-card-vacancy">{row.need}{row.object?` · ${row.object}`:""}</span>
    <div className="recruiting-card-stage-info">{middle}</div>
    <div className="recruiting-card-footer">{showOwner&&<span>{row.owner??"Без ответственного"}</span>}{risk&&<span className="needs-overdue">{risk}</span>}</div>
  </button>;
}

function NeedCallCheatSheet({need}:{need:RecruitingNeedRow|null}){
  if(!need)return <aside className="candidate-need-sheet empty-sheet"><strong>Выберите потребность</strong><span>Здесь появятся условия, которые можно сразу озвучивать кандидату во время разговора.</span></aside>;
  const c=need.conditions;
  return <aside className="candidate-need-sheet"><header><span>Условия вакансии</span><strong>{need.title}</strong><small>{[need.object,need.region].filter(Boolean).join(" · ")}</small></header><div className="candidate-need-pay"><span>На руки</span><strong>{displayCondition(c.workerPay)}</strong></div><dl><div><dt>График</dt><dd>{displayCondition(c.schedule)}</dd></div><div><dt>Смена</dt><dd>{displayCondition(c.shift)}</dd></div><div><dt>Проживание</dt><dd>{provisionLabel(c,"housing")}</dd></div><div><dt>Питание</dt><dd>{provisionLabel(c,"meals")}</dd></div><div><dt>Проезд</dt><dd>{provisionLabel(c,"travel")}</dd></div><div><dt>Развозка</dt><dd>{provisionLabel(c,"shuttle")}</dd></div><div><dt>СИЗ</dt><dd>{provisionLabel(c,"ppe")}</dd></div><div><dt>Медосмотр</dt><dd>{provisionLabel(c,"medical")}</dd></div></dl><div className="candidate-need-staffing"><span>Нужно <b>{need.required}</b></span><span>Работает <b>{need.working}</b></span><span>Найти <b>{need.toRecruit}</b></span></div>{c.requirements&&<p><strong>Требования:</strong> {displayCondition(c.requirements)}</p>}{c.comment&&<p><strong>Комментарий:</strong> {displayCondition(c.comment)}</p>}</aside>;
}

function travelLabel(value:unknown){return value==="ticket_required"?"Билет: нужно купить":value==="ticket_bought"?"Билет куплен":value==="company"?"Проезд организует компания":value==="self"?"Добирается самостоятельно":value==="not_required"?"Проезд не требуется":"Логистика не указана";}
function displayCondition(value:unknown){if(value==null||value==="")return"—";if(typeof value==="string"||typeof value==="number")return String(value);if(typeof value==="boolean")return value?"Да":"Нет";return JSON.stringify(value);}
function provisionLabel(conditions:Record<string,unknown>,key:string){const explicit=conditions[`${key}Provided`];const detail=displayCondition(conditions[key]);if(explicit===true)return detail==="—"?"Предоставляется":detail;if(explicit===false)return detail==="—"?"Не предоставляется":detail;return detail;}
