"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import type { CandidateDirectoryRow, RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";
import { contactChannelLabels } from "@/lib/recruiting/model";
import { useRecruitingApplications, saveDemoApplication } from "@/lib/recruiting/demo-client";
import { formatWorkDate, isActiveStage, workRisks } from "@/lib/recruiting/workflow";
import { Status } from "./UI";
import { RecruitingActionDrawer } from "./RecruitingActionDrawer";

type Props={
  people:CandidateDirectoryRow[];
  applications:RecruitingApplicationRow[];
  needs:RecruitingNeedRow[];
  options:RecruitingOptions;
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
  canImport:boolean;
};

type View="people"|"applications";
type Queue="all"|"active"|"reserve"|"completed"|"workers"|"database"|"archived";
type ImportRow={
  row:number;fullName:string;phone:string;email:string;city:string;telegram:string;max:string;whatsapp:string;notes:string;
  status:"new"|"existing"|"possible_duplicate"|"created"|"skipped"|"error";
  message?:string;match?:{id:string;fullName:string;phone:string|null;email:string|null;reason?:string}|null;
  candidateId?:string;applicationId?:string|null;
};
type ImportSummary={total:number;created:number;existing:number;linked:number;skipped:number;errors:number};

const importStorage="operis.recruiting.directory-import.v1";

export function CandidatesWorkspace({people,applications,needs,options,demo,canEdit,canConvert,canImport}:Props){
  const allApplications=useRecruitingApplications(applications,demo);
  const [localPeople,setLocalPeople]=useState<CandidateDirectoryRow[]>([]);
  const [query,setQuery]=useState("");
  const [queue,setQueue]=useState<Queue>("all");
  const [object,setObject]=useState("all");
  const [owner,setOwner]=useState("all");
  const [source,setSource]=useState("all");
  const [view,setView]=useState<View>("people");
  const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
  const [importOpen,setImportOpen]=useState(false);
  const [importFile,setImportFile]=useState<File|null>(null);
  const [importNeedId,setImportNeedId]=useState("");
  const [importRows,setImportRows]=useState<ImportRow[]>([]);
  const [importSummary,setImportSummary]=useState<ImportSummary|null>(null);
  const [importBusy,setImportBusy]=useState("");
  const [importError,setImportError]=useState("");
  const [forceNameDuplicates,setForceNameDuplicates]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const value=params.get("queue") as Queue|null;
    if(value&&["all","active","reserve","completed","workers","database","archived"].includes(value))setQueue(value);
    if(params.get("view")==="applications")setView("applications");
  },[]);

  useEffect(()=>{
    if(!demo)return;
    let frame=0;
    try{
      const stored=JSON.parse(localStorage.getItem(importStorage)||"[]") as CandidateDirectoryRow[];
      frame=requestAnimationFrame(()=>setLocalPeople(stored));
    }catch{}
    return()=>{if(frame)cancelAnimationFrame(frame)};
  },[demo]);

  const directory=useMemo(()=>[...localPeople,...people.filter(row=>!localPeople.some(local=>local.id===row.id))],[localPeople,people]);
  const latestAppByCandidate=useMemo(()=>{
    const map=new Map<string,RecruitingApplicationRow>();
    for(const row of allApplications){
      const current=map.get(row.candidateId);
      if(!current||Boolean(isActiveStage(row.stage))&&!isActiveStage(current.stage)||(row.updatedAt??"")>(current.updatedAt??""))map.set(row.candidateId,row);
    }
    return map;
  },[allApplications]);

  const peopleFiltered=useMemo(()=>directory.filter(row=>{
    const latest=latestAppByCandidate.get(row.id);
    if(queue==="active"&&row.activeApplicationCount===0)return false;
    if(queue==="reserve"&&row.latestStage!=="reserve"&&latest?.stage!=="reserve")return false;
    if(queue==="completed"&&!(row.activeApplicationCount===0&&["rejected","no_show"].includes(row.latestStage??latest?.stage??"")))return false;
    if(queue==="workers"&&!(row.workerId||row.status==="worker"))return false;
    if(queue==="database"&&row.applicationCount!==0)return false;
    if(queue==="archived"&&!row.archivedAt)return false;
    if(object!=="all"&&latest?.objectId!==object)return false;
    if(owner!=="all"&&latest?.ownerUserId!==owner)return false;
    if(source!=="all"&&row.source!==source)return false;
    const hay=(row.fullName+" "+(row.phone??"")+" "+(row.email??"")+" "+(row.city??"")+" "+(row.preferredContact??"")+" "+(row.latestNeed??"")+" "+(row.latestObject??"")+" "+(row.source??"")).toLocaleLowerCase("ru");
    return hay.includes(query.trim().toLocaleLowerCase("ru"));
  }),[directory,latestAppByCandidate,queue,object,owner,source,query]);

  const applicationFiltered=useMemo(()=>allApplications.filter(row=>{
    if(queue==="active"&&!isActiveStage(row.stage))return false;
    if(queue==="reserve"&&row.stage!=="reserve")return false;
    if(queue==="completed"&&!["rejected","no_show"].includes(row.stage))return false;
    if(queue==="workers"&&!["first_shift","retention_7","retention_30"].includes(row.stage))return false;
    if(queue==="database")return false;
    if(object!=="all"&&row.objectId!==object)return false;
    if(owner!=="all"&&row.ownerUserId!==owner)return false;
    if(source!=="all"&&row.source!==source)return false;
    const hay=(row.fullName+" "+(row.phone??"")+" "+(row.email??"")+" "+row.need+" "+(row.city??"")+" "+(row.object??"")+" "+(row.source??"")+" "+(row.sourceCampaign??"")).toLocaleLowerCase("ru");
    return hay.includes(query.trim().toLocaleLowerCase("ru"));
  }).sort((a,b)=>(Number(isActiveStage(b.stage))-Number(isActiveStage(a.stage)))||(a.nextActionAt??"9999").localeCompare(b.nextActionAt??"9999")),[allApplications,queue,object,owner,source,query]);

  const objectOptions=[...new Map(allApplications.filter(x=>x.objectId).map(x=>[x.objectId!,x.object??"—"])).entries()];
  const ownerOptions=[...new Map(allApplications.filter(x=>x.ownerUserId).map(x=>[x.ownerUserId!,x.owner??"—"])).entries()];
  const sourceOptions=[...new Set(directory.map(x=>x.source).filter((x):x is string=>Boolean(x)))].sort((a,b)=>a.localeCompare(b,"ru"));
  const activePeople=directory.filter(row=>row.activeApplicationCount>0).length;
  const workerPeople=directory.filter(row=>row.workerId||row.status==="worker").length;
  const baseOnly=directory.filter(row=>row.applicationCount===0).length;

  async function downloadTemplate(){
    const XLSX=await import("xlsx");
    const rows=[{"ФИО":"Иванов Иван Иванович","Телефон":"+7 900 000-00-00","Email":"","Город":"Тула","Telegram":"@username","MAX":"","WhatsApp":"","Комментарий":"Пример — удалите перед загрузкой"}];
    const sheet=XLSX.utils.json_to_sheet(rows,{header:["ФИО","Телефон","Email","Город","Telegram","MAX","WhatsApp","Комментарий"]});
    sheet["!cols"]=[{wch:32},{wch:20},{wch:28},{wch:18},{wch:20},{wch:20},{wch:20},{wch:44}];
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Кандидаты");
    XLSX.writeFile(book,"operis-candidates-import.xlsx");
  }

  async function parseDemoFile(file:File){
    const XLSX=await import("xlsx");
    const book=XLSX.read(await file.arrayBuffer(),{type:"array"});
    const sheet=book.Sheets[book.SheetNames[0]];
    if(!sheet)throw new Error("В файле нет листа с данными");
    const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""});
    const cell=(record:Record<string,unknown>,...names:string[])=>{for(const name of names){const value=record[name];if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim()}return""};
    return raw.map((record,index)=>{
      const row={row:index+2,fullName:cell(record,"ФИО","Фамилия Имя Отчество","fullName","name"),phone:cell(record,"Телефон","phone"),email:cell(record,"Email","E-mail","email"),city:cell(record,"Город","city"),telegram:cell(record,"Telegram","telegram"),max:cell(record,"MAX","Max","max"),whatsapp:cell(record,"WhatsApp","Whatsapp","whatsapp"),notes:cell(record,"Комментарий","comment","notes")};
      if(!row.fullName||(!row.phone&&!row.email&&!row.telegram&&!row.max&&!row.whatsapp))return {...row,status:"error" as const,message:"Нужны ФИО и хотя бы один контакт"};
      const digits=row.phone.replace(/\D/g,"");
      const strong=directory.find(person=>(digits&&person.phone?.replace(/\D/g,"")===digits)||(row.email&&person.email?.toLowerCase()===row.email.toLowerCase()));
      const nameMatch=!strong?directory.find(person=>person.fullName.trim().toLowerCase()===row.fullName.trim().toLowerCase()):undefined;
      return {...row,status:strong?"existing" as const:nameMatch?"possible_duplicate" as const:"new" as const,match:strong?{id:strong.id,fullName:strong.fullName,phone:strong.phone,email:strong.email,reason:"contact"}:nameMatch?{id:nameMatch.id,fullName:nameMatch.fullName,phone:nameMatch.phone,email:nameMatch.email,reason:"name"}:null};
    }).filter(row=>row.fullName||row.phone||row.email||row.telegram||row.max||row.whatsapp);
  }

  async function previewImport(){
    if(!importFile){setImportError("Выберите Excel-файл");return}
    setImportBusy("preview");setImportError("");setImportSummary(null);
    try{
      if(demo){
        const rows=await parseDemoFile(importFile);
        setImportRows(rows);setImportSummary({total:rows.length,created:0,existing:rows.filter(x=>x.status==="existing").length,linked:0,skipped:rows.filter(x=>x.status==="possible_duplicate").length,errors:rows.filter(x=>x.status==="error").length});
      }else{
        const data=new FormData();data.set("file",importFile);data.set("needId",importNeedId);data.set("dryRun","true");data.set("source","База компании / импорт");
        const response=await fetch("/api/candidates/import",{method:"POST",body:data});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось проверить файл");
        setImportRows(json.rows);setImportSummary(json.summary);
      }
    }catch(e){setImportError(e instanceof Error?e.message:"Не удалось прочитать файл")}
    finally{setImportBusy("")}
  }

  async function commitImport(){
    if(!importFile||!importRows.length)return;
    setImportBusy("commit");setImportError("");
    try{
      if(demo){
        const next=[...localPeople];
        const need=needs.find(item=>item.id===importNeedId);
        let created=0,existing=0,linked=0,skipped=0,errors=0;
        for(const row of importRows){
          if(row.status==="error"){errors++;continue}
          if(row.status==="possible_duplicate"&&!forceNameDuplicates){skipped++;continue}
          const digits=row.phone.replace(/\D/g,"");
          const old=next.find(person=>(digits&&person.phone?.replace(/\D/g,"")===digits)||(row.email&&person.email?.toLowerCase()===row.email.toLowerCase()));
          let candidate=old;
          if(!candidate){
            const id=crypto.randomUUID();const now=new Date().toISOString();
            candidate={id,fullName:row.fullName,phone:row.phone||null,email:row.email||null,city:row.city||null,preferredChannel:row.telegram?"telegram":row.max?"max":row.whatsapp?"whatsapp":row.phone?"phone":"email",preferredContact:row.telegram||row.max||row.whatsapp||row.phone||row.email||null,source:"База компании / импорт",status:"active",applicationCount:0,activeApplicationCount:0,latestApplicationId:null,latestStage:null,latestStageLabel:null,latestNeed:null,latestObject:null,latestOwner:null,lastContactAt:null,lastContactSummary:null,workerId:null,archivedAt:null,createdAt:now,updatedAt:now};
            next.unshift(candidate);created++;
          }else existing++;
          if(need&&!allApplications.some(app=>app.candidateId===candidate.id&&app.needId===need.id)){
            const now=new Date().toISOString();
            saveDemoApplication({applicationId:crypto.randomUUID(),candidateId:candidate.id,organizationId:need.organizationId,fullName:candidate.fullName,phone:candidate.phone,email:candidate.email,preferredChannel:candidate.preferredChannel,telegram:row.telegram||null,whatsapp:row.whatsapp||null,city:candidate.city,source:"База компании / импорт",sourceChannel:"Импорт Excel",sourceCampaign:null,sourceReference:null,stage:"new",stageLabel:"Новый контакт",needId:need.id,need:need.title,objectId:need.objectId,object:need.object,regionId:need.regionId,clientId:need.clientId,ownerUserId:need.ownerUserId,owner:need.owner,managerUserId:need.managerUserId,manager:need.manager,assigneeUserIds:need.assigneeUserIds,createdAt:now,updatedAt:now,stageEnteredAt:now,nextActionAt:null,workflow:{actionCode:"inbound_contact",outcomeCode:"unprocessed"},stageEvents:[{toStage:"new",createdAt:now,reason:"Импортирован из базы компании"}],nextAction:null,plannedStartDate:null,plannedArrivalAt:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,conditions:need.conditions,recentCommunications:[]});linked++;
            candidate.applicationCount+=1;candidate.activeApplicationCount+=1;candidate.latestStage="new";candidate.latestStageLabel="Новый контакт";candidate.latestNeed=need.title;candidate.latestObject=need.object;candidate.latestOwner=need.owner;
          }
        }
        localStorage.setItem(importStorage,JSON.stringify(next));setLocalPeople(next);setImportSummary({total:importRows.length,created,existing,linked,skipped,errors});
      }else{
        const data=new FormData();data.set("file",importFile);data.set("needId",importNeedId);data.set("dryRun","false");data.set("forceNameDuplicates",String(forceNameDuplicates));data.set("source","База компании / импорт");
        const response=await fetch("/api/candidates/import",{method:"POST",body:data});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось импортировать кандидатов");
        setImportRows(json.rows);setImportSummary(json.summary);window.location.reload();
      }
    }catch(e){setImportError(e instanceof Error?e.message:"Не удалось импортировать кандидатов")}
    finally{setImportBusy("")}
  }

  return <div className="recruiting-workspace candidate-directory">
    <div className="recruiting-summary">
      <div><span>Людей в базе</span><strong>{directory.length}</strong></div>
      <div><span>Активно в подборе</span><strong>{activePeople}</strong></div>
      <div><span>Стали сотрудниками</span><strong>{workerPeople}</strong></div>
      <div><span>Только в базе</span><strong>{baseOnly}</strong></div>
    </div>

    <div className="recruiting-toolbar">
      <div className="segmented-control"><button className={view==="people"?"active":""} onClick={()=>setView("people")}>Люди</button><button className={view==="applications"?"active":""} onClick={()=>setView("applications")}>Заявки на потребности</button></div>
      <div className="recruiting-toolbar-actions">
        {canImport&&<button className="button" onClick={()=>{setImportOpen(true);setImportError("")}}><Upload size={14}/> Импорт Excel</button>}
        <Link className="button" href="/needs?view=analytics">Аналитика источников</Link>
        <Link className="button primary" href="/recruiting">Открыть воронку / добавить</Link>
      </div>
    </div>

    <div className="candidate-directory-queues">
      {([["all","Все"],["active","В работе"],["reserve","Резерв"],["completed","Завершённые"],["workers","Сотрудники"],["database","Только база"],["archived","Архив"]] as Array<[Queue,string]>).map(([value,label])=><button key={value} className={queue===value?"active":""} onClick={()=>setQueue(value)}>{label}</button>)}
    </div>

    <div className="recruiting-toolbar">
      <input className="request-search" aria-label="Поиск кандидата" placeholder="ФИО, телефон, мессенджер, город, вакансия" value={query} onChange={e=>setQuery(e.target.value)}/>
      <select aria-label="Объект" value={object} onChange={e=>setObject(e.target.value)}><option value="all">Объект: все</option>{objectOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="Рекрутер" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">Рекрутер: все</option>{ownerOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="Источник" value={source} onChange={e=>setSource(e.target.value)}><option value="all">Источник: все</option>{sourceOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
      <button className="button" onClick={()=>{setQuery("");setQueue("all");setObject("all");setOwner("all");setSource("all")}}>Сбросить</button>
    </div>

    {view==="people"?<PeopleTable rows={peopleFiltered} latestAppByCandidate={latestAppByCandidate}/>:<ApplicationsTable rows={applicationFiltered} all={allApplications} onOpen={setSelected}/>}
    {selected&&<RecruitingActionDrawer row={selected} need={needs.find(item=>item.id===selected.needId)??null} needs={needs} recruiters={options.recruiters} stages={options.funnelStages} demo={demo} canEdit={canEdit} canConvert={canConvert} exitReasons={options.exitReasons} onClose={()=>setSelected(null)}/>}

    {importOpen&&<div className="recruiting-modal candidate-import-modal" onMouseDown={e=>{if(e.currentTarget===e.target&&!importBusy)setImportOpen(false)}}>
      <div className="recruiting-modal-card candidate-import-card">
        <div className="recruiting-modal-head"><div><h2>Массовая загрузка кандидатов</h2><p>Сначала система покажет новые строки, найденные совпадения и возможные дубли. ФИО само по себе никогда не объединяется автоматически.</p></div><button className="icon-button" onClick={()=>setImportOpen(false)}><X size={17}/></button></div>
        <div className="candidate-import-body">
          {importError&&<div className="recruiting-error">{importError}</div>}
          <div className="candidate-import-steps">
            <section><span>1</span><div><strong>Скачайте шаблон</strong><small>ФИО, телефон, Email, город, Telegram, MAX, WhatsApp и комментарий.</small></div><button className="button" onClick={()=>void downloadTemplate()}><Download size={14}/> Excel-шаблон</button></section>
            <section><span>2</span><div><strong>Выберите файл и назначение</strong><small>Без потребности люди попадут только в базу. С потребностью — ещё и в «Новый контакт».</small></div><label className="candidate-import-file"><FileSpreadsheet size={15}/><input type="file" accept=".xlsx,.xls" onChange={e=>{setImportFile(e.target.files?.[0]??null);setImportRows([]);setImportSummary(null)}}/><b>{importFile?.name??"Выбрать Excel"}</b></label></section>
          </div>
          <div className="candidate-import-options"><label>Добавить в потребность<select value={importNeedId} onChange={e=>setImportNeedId(e.target.value)}><option value="">Только в базу кандидатов</option>{needs.filter(item=>["open","in_progress"].includes(item.status)).map(item=><option key={item.id} value={item.id}>{item.title} · {item.object??item.region??"без объекта"}</option>)}</select></label><button className="button" disabled={!importFile||Boolean(importBusy)} onClick={()=>void previewImport()}>{importBusy==="preview"?"Проверяю…":"Проверить файл"}</button></div>
          {importSummary&&<div className="candidate-import-summary"><span>Строк <b>{importSummary.total}</b></span><span>Новых <b>{importRows.filter(x=>x.status==="new"||x.status==="created").length}</b></span><span>Найдены в базе <b>{importRows.filter(x=>x.status==="existing").length}</b></span><span>Нужно проверить <b>{importRows.filter(x=>x.status==="possible_duplicate").length}</b></span><span>Ошибок <b>{importRows.filter(x=>x.status==="error").length}</b></span></div>}
          {importRows.length>0&&<div className="candidate-import-preview"><table className="data-table"><thead><tr><th>Строка</th><th>Кандидат</th><th>Контакт</th><th>Результат проверки</th></tr></thead><tbody>{importRows.slice(0,200).map(row=><tr key={row.row}><td>{row.row}</td><td><strong>{row.fullName||"—"}</strong><span className="cell-sub">{row.city}</span></td><td>{row.phone||row.email||row.telegram||row.max||row.whatsapp||"—"}</td><td><ImportStatus row={row}/></td></tr>)}</tbody></table>{importRows.length>200&&<div className="empty-inline">Показаны первые 200 строк из {importRows.length}</div>}</div>}
          {importRows.some(row=>row.status==="possible_duplicate")&&<label className="candidate-import-force"><input type="checkbox" checked={forceNameDuplicates} onChange={e=>setForceNameDuplicates(e.target.checked)}/><span><strong>Создать людей с совпадающим ФИО как отдельные карточки</strong><small>Используйте только после проверки: одинаковое ФИО не считается надёжным признаком дубля.</small></span></label>}
        </div>
        <div className="recruiting-modal-footer"><button className="button" onClick={()=>setImportOpen(false)}>Закрыть</button><button className="button primary" disabled={!importRows.length||Boolean(importBusy)||importRows.some(row=>row.status==="possible_duplicate")&&!forceNameDuplicates} onClick={()=>void commitImport()}>{importBusy==="commit"?"Импортирую…":"Импортировать"}</button></div>
      </div>
    </div>}
  </div>;
}

function PeopleTable({rows,latestAppByCandidate}:{rows:CandidateDirectoryRow[];latestAppByCandidate:Map<string,RecruitingApplicationRow>}){
  return <div className="section section-flush"><div className="request-table-wrap"><table className="data-table candidate-directory-table"><thead><tr>{["Кандидат","Связь","Статус","Текущая / последняя заявка","Источник","Последний контакт","История",""].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{const latest=latestAppByCandidate.get(row.id);const stage=row.latestStage??latest?.stage??null;return <tr key={row.id}>
    <td><Link className="cell-title" href={"/candidates/"+row.id}>{row.fullName}</Link><span className="cell-sub">{row.city??"Город не указан"}</span></td>
    <td><strong>{row.preferredContact??row.phone??row.email??"—"}</strong><span className="cell-sub">{contactChannelLabels[row.preferredChannel??""]??"Основной контакт"}</span></td>
    <td><Status tone={row.workerId||row.status==="worker"?"good":row.archivedAt?"neutral":stage&&["rejected","no_show"].includes(stage)?"bad":"info"}>{row.workerId||row.status==="worker"?"Сотрудник":row.archivedAt?"Архив":stage?row.latestStageLabel??latest?.stageLabel:"Только в базе"}</Status></td>
    <td>{row.latestNeed??latest?.need??"Нет активной заявки"}<span className="cell-sub">{row.latestObject??latest?.object??(row.applicationCount?"Заявка завершена":"Можно предложить вакансию")}</span></td>
    <td>{row.source??"—"}</td><td>{row.lastContactSummary??"—"}<span className="cell-sub">{row.lastContactAt??""}</span></td>
    <td>Заявок: {row.applicationCount}<span className="cell-sub">Активных: {row.activeApplicationCount}</span></td>
    <td><Link className="button" href={"/candidates/"+row.id}>Карточка</Link></td>
  </tr>})}</tbody></table>{!rows.length&&<div className="empty-inline">Кандидаты по выбранным условиям не найдены</div>}</div></div>;
}

function ApplicationsTable({rows,all,onOpen}:{rows:RecruitingApplicationRow[];all:RecruitingApplicationRow[];onOpen:(row:RecruitingApplicationRow)=>void}){
  return <div className="section section-flush"><div className="request-table-wrap"><table className="data-table candidates-list-table"><thead><tr>{["Кандидат","Контакт","Источник / кампания","Потребность","Этап","Ответственный","Следующее действие","Последний контакт","Риски","История",""].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{const related=all.filter(x=>x.candidateId===row.candidateId);return <tr key={row.applicationId}>
    <td><Link className="cell-title" href={"/candidates/"+row.candidateId}>{row.fullName}</Link><span className="cell-sub">{row.city??"Город не указан"}</span></td>
    <td>{row.phone??row.email??"—"}<span className="cell-sub">{contactChannelLabels[row.preferredChannel??""]??""}</span></td>
    <td>{row.source??"—"}<span className="cell-sub">{row.sourceCampaign??(row.sourceChannel!==row.source?row.sourceChannel:"")}</span></td>
    <td>{row.need}<span className="cell-sub">{row.object??"Без объекта"}</span></td>
    <td><Status tone={["first_shift","retention_7","retention_30"].includes(row.stage)?"good":["rejected","no_show"].includes(row.stage)?"bad":"neutral"}>{row.stageLabel}</Status><span className="cell-sub">С {formatWorkDate(row.stageEnteredAt)}</span></td>
    <td>{row.owner??"Не назначен"}<span className="cell-sub">{row.manager??""}</span></td>
    <td>{row.workflow?.nextActionText??actionLabel(row)}<span className="cell-sub">{formatWorkDate(row.nextActionAt)}</span></td>
    <td>{row.workflow?.lastContact??row.recentCommunications?.[0]?.summary??"—"}</td><td>{workRisks(row).join(" · ")||"—"}</td>
    <td>Заявок: {related.length}<span className="cell-sub">Активных: {related.filter(x=>isActiveStage(x.stage)).length}</span></td><td><button className="button" onClick={()=>onOpen(row)}>Открыть</button></td>
  </tr>})}</tbody></table>{!rows.length&&<div className="empty-inline">Нет заявок по выбранным условиям</div>}</div></div>;
}

function actionLabel(row:RecruitingApplicationRow){
  if(row.stage==="new")return"Взять контакт в работу";
  if(row.stage==="interview")return row.workflow?.managerInterviewState==="pending"?"Интервью мастера":"Получить решение";
  if(row.stage==="documents")return"Собрать документы для оформления";
  if(row.stage==="clearance")return"Проверить допуски";
  if(row.stage==="preparation")return"Подготовить к выходу";
  if(row.stage==="first_shift")return"Подтвердить первый выход";
  return"—";
}
function ImportStatus({row}:{row:ImportRow}){
  if(row.status==="new")return <Status tone="good">Новый</Status>;
  if(row.status==="existing")return <span><Status tone="info">Найден в базе</Status><span className="cell-sub">{row.match?.fullName}</span></span>;
  if(row.status==="possible_duplicate")return <span><Status tone="warn">Проверить дубль</Status><span className="cell-sub">{row.match?.fullName}</span></span>;
  if(row.status==="error")return <span><Status tone="bad">Ошибка</Status><span className="cell-sub">{row.message}</span></span>;
  if(row.status==="skipped")return <Status tone="neutral">Пропущен</Status>;
  return <Status tone="good">Импортирован</Status>;
}
