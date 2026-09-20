'use client';

import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useEffect,useMemo,useState} from 'react';
import {Download,FileSpreadsheet,Upload,X} from 'lucide-react';
import type {CandidateDirectoryRow,RecruitingApplicationRow,RecruitingNeedRow,RecruitingOptions} from '@/lib/recruiting/service';
import {contactChannelLabels,type RecruitingStage} from '@/lib/recruiting/model';
import {useRecruitingApplications,saveDemoApplication} from '@/lib/recruiting/demo-client';
import {formatWorkDate} from '@/lib/recruiting/workflow';
import {Status} from './UI';
import {SalesSearch,SalesSegments} from './sales/SalesUI';

type ImportRow={
 fullName:string;phone:string|null;email:string|null;city:string|null;telegram:string|null;whatsapp:string|null;max:string|null;preferredChannel:"phone"|"email"|"telegram"|"whatsapp"|"max"|"other"|null;
};
type CandidateBucket='new'|'recruiting'|'post_exit'|'inactive';
type OperationalBucket=CandidateBucket|'employee';
const directoryStorage='operis.recruiting.directory.imports.v1';
const recruitingStages=new Set<RecruitingStage>(['interview','documents','clearance','preparation']);
const postExitStages=new Set<RecruitingStage>(['first_shift','retention_7']);
const terminalStages=new Set<RecruitingStage>(['reserve','rejected','no_show']);

export function CandidatesWorkspace({
 rows,directory,needs,options,initialQueue,demo,canCreate,
}:{
 rows:RecruitingApplicationRow[];
 directory:CandidateDirectoryRow[];
 needs:RecruitingNeedRow[];
 options:RecruitingOptions;
 initialQueue:string;
 demo:boolean;
 canCreate:boolean;
}){
 const all=useRecruitingApplications(rows,demo);
 const [query,setQuery]=useState('');
 const [bucket,setBucket]=useState<CandidateBucket>(normalizeQueue(initialQueue));
 const [stage,setStage]=useState('all');
 const [object,setObject]=useState('all');
 const [owner,setOwner]=useState('all');
 const [source,setSource]=useState('all');
 const [showImport,setShowImport]=useState(false);
 const [importRows,setImportRows]=useState<ImportRow[]>([]);
 const [importNeedId,setImportNeedId]=useState('');
 const [importSource,setImportSource]=useState('База компании / импорт');
 const [importOwner,setImportOwner]=useState('');
 const [importBusy,setImportBusy]=useState(false);
 const [importError,setImportError]=useState('');
 const [importResult,setImportResult]=useState('');
 const [localDirectory,setLocalDirectory]=useState<CandidateDirectoryRow[]>([]);

 useEffect(()=>{
  if(!demo)return;
  let frame=0;
  try{
   const saved=JSON.parse(localStorage.getItem(directoryStorage)||'[]') as CandidateDirectoryRow[];
   frame=requestAnimationFrame(()=>setLocalDirectory(saved));
  }catch{}
  return()=>{if(frame)cancelAnimationFrame(frame)};
 },[demo]);

 const people=useMemo(()=>[...localDirectory,...directory.filter(row=>!localDirectory.some(local=>local.id===row.id))],[directory,localDirectory]);
 const latestByCandidate=useMemo(()=>{
  const map=new Map<string,RecruitingApplicationRow>();
  for(const application of all){
   const current=map.get(application.candidateId);
   const currentTime=current?.updatedAt??current?.createdAt??"";
   const applicationTime=application.updatedAt??application.createdAt??"";
   if(!current||applicationTime>currentTime)map.set(application.candidateId,application);
  }
  return map;
 },[all]);
 const counts=useMemo(()=>people.reduce<Record<CandidateBucket,number>>((acc,row)=>{
  const value=candidateBucket(row,latestByCandidate.get(row.id));
  if(value!=="employee")acc[value]++;
  return acc;
 },{new:0,recruiting:0,post_exit:0,inactive:0}),[people,latestByCandidate]);
 const searchActive=Boolean(query.trim());
 const filteredPeople=people.filter(row=>{
  const latest=latestByCandidate.get(row.id);
  if(!searchActive&&candidateBucket(row,latest)!==bucket)return false;
  if(source!=='all'&&row.source!==source)return false;
  if(stage!=='all'&&latest?.stage!==stage)return false;
  if(object!=='all'&&latest?.objectId!==object)return false;
  if(owner!=='all'&&latest?.ownerUserId!==owner)return false;
  return matchesCandidateQuery(row,latest,query);
 }).sort((a,b)=>{
  const aBucket=candidateBucket(a,latestByCandidate.get(a.id));
  const bBucket=candidateBucket(b,latestByCandidate.get(b.id));
  return bucketRank(aBucket)-bucketRank(bBucket)||b.updatedAt.localeCompare(a.updatedAt);
 });

 const objectOptions=unique(all,'objectId','object');
 const ownerOptions=unique(all,'ownerUserId','owner');
 const sourceOptions=[...new Set(people.map(row=>row.source).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,'ru'));
 const stageOptions=stageOptionsFor(bucket,options);


 async function downloadTemplate(){
  const XLSX=await import('xlsx');
  const sheet=XLSX.utils.json_to_sheet([{
   'ФИО':'Иванов Иван Иванович','Телефон':'+7 900 000-00-00','Email':'','Город':'Тула','Telegram':'@ivanov','WhatsApp':'','MAX':'','Предпочтительный канал':'telegram'
  }]);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Кандидаты');
  XLSX.writeFile(book,'operis_candidates_import.xlsx');
 }

 async function readImportFile(file:File){
  setImportError('');setImportResult('');
  try{
   const XLSX=await import('xlsx');
   const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
   const sheet=workbook.Sheets[workbook.SheetNames[0]];
   const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});
   const mapped=raw.map((row,index)=>mapImportRow(row,index)).filter((row):row is ImportRow=>Boolean(row));
   if(!mapped.length)throw new Error('В файле нет строк кандидатов.');
   setImportRows(mapped);
  }catch(e){setImportError(e instanceof Error?e.message:'Не удалось прочитать файл');setImportRows([]);}
 }

 async function runImport(){
  if(!importRows.length)return;
  setImportBusy(true);setImportError('');setImportResult('');
  try{
   if(demo){
    const current=[...localDirectory];
    let created=0,reused=0,applications=0;
    for(const item of importRows){
      const normalized=digits(item.phone??'');
      const existing=[...people,...current].find(candidate=>normalized&&digits(candidate.phone??'')===normalized);
      const candidateId=existing?.id??crypto.randomUUID();
      if(existing)reused++;
      else{
        created++;
        current.unshift({
          id:candidateId,fullName:item.fullName,phone:item.phone,city:item.city,preferredChannel:item.preferredChannel,preferredContact:preferredValue(item),
          source:importSource,status:importNeedId?'active':'candidate',latestNeed:null,latestObject:null,latestStage:null,latestStageLabel:null,owner:options.recruiters.find(r=>r.id===importOwner)?.name??null,
          applicationsCount:0,activeApplications:0,workerId:null,updatedAt:new Date().toISOString(),
        });
      }
      if(importNeedId){
        const need=needs.find(row=>row.id===importNeedId);
        if(need&&!all.some(app=>app.candidateId===candidateId&&app.needId===need.id)){
          const now=new Date().toISOString();
          saveDemoApplication({
            applicationId:crypto.randomUUID(),candidateId,organizationId:need.organizationId,fullName:item.fullName,phone:item.phone,email:item.email,preferredChannel:item.preferredChannel,
            telegram:item.telegram,whatsapp:item.whatsapp,city:item.city,source:importSource,sourceChannel:'Импорт базы',sourceCampaign:null,sourceReference:null,
            stage:'new',stageLabel:'Новый контакт',needId:need.id,need:need.title,objectId:need.objectId,object:need.object,regionId:need.regionId,clientId:need.clientId,
            ownerUserId:importOwner||need.ownerUserId,owner:options.recruiters.find(r=>r.id===importOwner)?.name??need.owner,managerUserId:need.managerUserId,manager:need.manager,assigneeUserIds:need.assigneeUserIds,
            createdAt:now,updatedAt:now,stageEnteredAt:now,nextActionAt:null,nextAction:null,plannedStartDate:null,plannedArrivalAt:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,
            conditions:need.conditions,workflow:{actionCode:'inbound_contact',outcomeCode:'unprocessed'},stageEvents:[{toStage:'new',createdAt:now,reason:'Массовая загрузка кандидатов'}],
          });applications++;
        }
      }
    }
    setLocalDirectory(current);localStorage.setItem(directoryStorage,JSON.stringify(current));
    setImportResult(`Импорт завершён: новых ${created}, найдено существующих ${reused}, заявок создано ${applications}.`);
   }else{
    const response=await fetch('/api/candidates/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rows:importRows,needId:importNeedId||null,source:importSource,ownerUserId:importOwner||null})});
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error??'Не удалось импортировать кандидатов');
    setImportResult(`Импорт завершён: новых ${json.created}, существующих ${json.reused}, заявок создано ${json.applications}.`);
    window.location.reload();
   }
  }catch(e){setImportError(e instanceof Error?e.message:'Не удалось импортировать кандидатов');}
  finally{setImportBusy(false);}
 }

 return <div className="recruiting-workspace candidate-directory candidate-directory-v2">
  <div className="candidate-directory-actions">
   <SalesSegments label="Состояние кандидатов" value={bucket} onChange={value=>{setBucket(value);setStage('all')}} items={[
    {value:'new',label:`Новые · ${counts.new}`},
    {value:'recruiting',label:`В подборе · ${counts.recruiting}`},
    {value:'post_exit',label:`После выхода · ${counts.post_exit}`},
    {value:'inactive',label:`Неактивные · ${counts.inactive}`},
   ]}/>
   <div className="candidate-directory-buttons">{canCreate&&<button className="button" onClick={()=>setShowImport(true)}><Upload size={14}/> Импорт базы</button>}<Link className="button primary" href="/recruiting">Открыть воронку / добавить</Link></div>
  </div>

  <div className="candidate-directory-search">
   <SalesSearch value={query} onChange={setQuery} placeholder="Найти по ФИО, телефону, email или мессенджеру"/>
   {searchActive&&<span>Поиск по всей базе, включая сотрудников.</span>}
  </div>

  <div className="candidate-directory-filters candidate-directory-filters-v2">
   <select aria-label="Этап" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">Все этапы</option>{stageOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <select aria-label="Объект" value={object} onChange={e=>setObject(e.target.value)}><option value="all">Объект: все</option>{objectOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <select aria-label="Рекрутер" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">Ответственный: все</option>{ownerOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <select aria-label="Источник" value={source} onChange={e=>setSource(e.target.value)}><option value="all">Источник: все</option>{sourceOptions.map(v=><option key={v} value={v}>{v}</option>)}</select>
   <button className="button" onClick={()=>{setQuery('');setStage('all');setObject('all');setOwner('all');setSource('all');}}>Сбросить</button>
  </div>

  <CandidatePeopleTable rows={filteredPeople} applications={all} demo={demo}/>
  {showImport&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowImport(false)}}>
   <div className="recruiting-modal-card candidate-import-modal">
    <div className="recruiting-modal-head"><div><h2>Импорт базы кандидатов</h2><p>Загрузите Excel. Система проверит существующие контакты и не создаст новую карточку при точном совпадении телефона, email или мессенджера.</p></div><button className="icon-button" onClick={()=>setShowImport(false)}><X size={17}/></button></div>
    <div className="candidate-import-body">
     <section className="candidate-import-template"><div><FileSpreadsheet size={20}/><span><strong>Шаблон OPERIS</strong><small>ФИО, телефон, email, город, Telegram, WhatsApp, MAX и предпочтительный канал.</small></span></div><button className="button" onClick={()=>void downloadTemplate()}><Download size={14}/> Скачать .xlsx</button></section>
     <label className="candidate-import-drop"><Upload size={18}/><strong>Выберите Excel-файл</strong><span>.xlsx или .xls · до 1000 строк за загрузку</span><input type="file" accept=".xlsx,.xls" onChange={e=>{const file=e.target.files?.[0];if(file)void readImportFile(file)}}/></label>
     {importRows.length>0&&<div className="candidate-import-preview"><header><strong>Найдено строк: {importRows.length}</strong><span>Первые 6 строк</span></header><div className="request-table-wrap"><table className="data-table"><thead><tr><th>ФИО</th><th>Телефон</th><th>Город</th><th>Канал</th></tr></thead><tbody>{importRows.slice(0,6).map((row,index)=><tr key={index}><td>{row.fullName}</td><td>{row.phone??'—'}</td><td>{row.city??'—'}</td><td>{contactChannelLabels[row.preferredChannel??'']??'—'}</td></tr>)}</tbody></table></div></div>}
     <div className="candidate-import-options"><label>Куда загрузить<select value={importNeedId} onChange={e=>setImportNeedId(e.target.value)}><option value="">Только в базу кандидатов</option>{needs.filter(row=>['open','in_progress'].includes(row.status)).map(row=><option key={row.id} value={row.id}>{row.title} · {row.object??row.region??'без объекта'}</option>)}</select></label><label>Источник<select value={importSource} onChange={e=>setImportSource(e.target.value)}>{options.sourceCatalog.filter(row=>row.active).map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></label><label>Ответственный<select value={importOwner} onChange={e=>setImportOwner(e.target.value)}><option value="">По умолчанию</option>{options.recruiters.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
     {importError&&<div className="recruiting-error">{importError}</div>}{importResult&&<div className="candidate-import-result">{importResult}</div>}
    </div>
    <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowImport(false)}>Закрыть</button><button className="button primary" disabled={!importRows.length||importBusy} onClick={()=>void runImport()}>{importBusy?'Импортирую…':`Импортировать ${importRows.length||''}`}</button></div>
   </div>
  </div></Portal>}
 </div>;
}

function CandidatePeopleTable({rows,applications,demo}:{rows:CandidateDirectoryRow[];applications:RecruitingApplicationRow[];demo:boolean}){
 return <div className="section section-flush"><div className="request-table-wrap"><table className="data-table candidates-directory-table"><thead><tr>{['Кандидат','Статус','Предпочтительная связь','Последняя заявка','Источник','Ответственный','История','Обновлено',''].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{const latest=applications.find(app=>app.candidateId===row.id);const localOnly=demo&&!applications.some(app=>app.candidateId===row.id);return <tr key={row.id}>
  <td>{localOnly?<strong className="cell-title">{row.fullName}</strong>:<Link className="cell-title" href={`/candidates/${row.id}`}>{row.fullName}</Link>}<span className="cell-sub">{row.city??'Город не указан'}{row.phone?` · ${row.phone}`:''}</span></td>
  <td><Status tone={candidateStatusTone(row,latest)}>{candidateStatusLabel(row,latest)}</Status>{row.latestStageLabel&&<span className="cell-sub">{row.latestStageLabel}</span>}</td>
  <td><strong>{contactChannelLabels[row.preferredChannel??'']??'Контакт'}</strong><span className="cell-sub">{row.preferredContact??row.phone??'—'}</span></td>
  <td>{row.latestNeed??'Нет активной заявки'}<span className="cell-sub">{row.latestObject??''}</span></td>
  <td>{row.source??'—'}</td><td>{row.owner??'—'}</td>
  <td>Заявок: {row.applicationsCount}<span className="cell-sub">Активных: {row.activeApplications}</span></td>
  <td>{formatWorkDate(row.updatedAt)}</td>
  <td>{latest?<Link className="button" href={`/candidates/${row.id}`}>Карточка</Link>:<span className="cell-sub">База</span>}</td>
 </tr>})}</tbody></table>{!rows.length&&<div className="empty-inline">Кандидаты по выбранным условиям не найдены</div>}</div></div>;
}

function mapImportRow(row:Record<string,unknown>,index:number):ImportRow|null{
 const get=(...keys:string[])=>{for(const key of keys){const value=row[key];if(value!=null&&String(value).trim())return String(value).trim()}return''};
 const fullName=get('ФИО','Фамилия Имя Отчество','Имя','fullName');if(!fullName)return null;
 const preferred=normalizeChannel(get('Предпочтительный канал','Канал связи','preferredChannel'));
 return {fullName,phone:nullable(get('Телефон','phone')),email:nullable(get('Email','E-mail','email')),city:nullable(get('Город','city')),telegram:nullable(get('Telegram','telegram')),whatsapp:nullable(get('WhatsApp','Whatsapp','whatsapp')),max:nullable(get('MAX','Max','max')),preferredChannel:preferred};
}
function normalizeChannel(value:string):ImportRow['preferredChannel']{const v=value.toLocaleLowerCase('ru');if(v.includes('telegram'))return'telegram';if(v.includes('whats'))return'whatsapp';if(v==='max'||v.includes('макс'))return'max';if(v.includes('mail'))return'email';if(v.includes('тел'))return'phone';return value?'other':null}
function nullable(value:string){return value||null}
function digits(value:string){return value.replace(/\D/g,'')}
function preferredValue(row:ImportRow){return row.preferredChannel==='telegram'?row.telegram:row.preferredChannel==='whatsapp'?row.whatsapp:row.preferredChannel==='max'?row.max:row.preferredChannel==='email'?row.email:row.phone}
function normalizeQueue(value:string):CandidateBucket{
 if(value==='candidate'||value==='new')return'new';
 if(value==='worker'||value==='post_exit')return'post_exit';
 if(value==='reserve'||value==='completed'||value==='closed'||value==='inactive')return'inactive';
 return'recruiting';
}
function candidateBucket(row:CandidateDirectoryRow,latest?:RecruitingApplicationRow):OperationalBucket{
 const stage=latest?.stage??row.latestStage;
 if(stage==='new'||(!stage&&row.status==='candidate'))return'new';
 if(stage&&recruitingStages.has(stage))return'recruiting';
 if(stage&&postExitStages.has(stage))return'post_exit';
 if(stage==='retention_30'||(row.workerId&&row.status==='worker'))return'employee';
 if((stage&&terminalStages.has(stage))||row.status==='reserve'||row.status==='completed')return'inactive';
 return row.status==='active'?'recruiting':'new';
}
function candidateStatusLabel(row:CandidateDirectoryRow,latest?:RecruitingApplicationRow){
 const value=candidateBucket(row,latest);
 if(value==='new')return'Новый';
 if(value==='recruiting')return'В подборе';
 if(value==='post_exit')return'После выхода';
 if(value==='employee')return'Сотрудник';
 if(latest?.stage==='reserve'||row.status==='reserve')return'Резерв';
 if(latest?.stage==='no_show')return'Не вышел';
 return'Завершён';
}
function candidateStatusTone(row:CandidateDirectoryRow,latest?:RecruitingApplicationRow):'good'|'warn'|'bad'|'info'|'neutral'{
 const value=candidateBucket(row,latest);
 if(value==='employee'||value==='post_exit')return'good';
 if(value==='new'||value==='recruiting')return'info';
 if(latest?.stage==='reserve'||row.status==='reserve')return'warn';
 if(latest?.stage==='no_show'||latest?.stage==='rejected')return'bad';
 return'neutral';
}
function bucketRank(value:OperationalBucket){return value==='new'?0:value==='recruiting'?1:value==='post_exit'?2:value==='inactive'?3:4}
function matchesCandidateQuery(row:CandidateDirectoryRow,app:RecruitingApplicationRow|undefined,query:string){
 const raw=query.trim();if(!raw)return true;
 const text=[row.id,row.fullName,row.phone,row.city,row.preferredContact,row.source,app?.fullName,app?.phone,app?.email,app?.telegram,app?.whatsapp,app?.need,app?.object,app?.source,app?.sourceChannel,app?.sourceCampaign,app?.sourceReference].filter(Boolean).join(' ').toLocaleLowerCase('ru');
 const normalized=raw.toLocaleLowerCase('ru').replace(/\s+/g,' ');
 const terms=normalized.split(' ').filter(Boolean);
 const textMatch=terms.every(term=>text.includes(term));
 const phoneQuery=digits(raw);
 if(phoneQuery.length>=4){
  const contactDigits=digits([row.phone,row.preferredContact,app?.phone,app?.telegram,app?.whatsapp].filter(Boolean).join(' '));
  if(contactDigits.includes(phoneQuery))return true;
 }
 return textMatch;
}
function stageOptionsFor(bucket:CandidateBucket,options:RecruitingOptions):Array<[string,string]>{
 const labels=new Map(options.funnelStages.map(row=>[row.code,row.label]));
 const codes:RecruitingStage[]=bucket==='new'?['new']:
  bucket==='recruiting'?['interview','documents','clearance','preparation']:
  bucket==='post_exit'?['first_shift','retention_7']:
  ['reserve','rejected','no_show'];
 return codes.map(code=>[code,labels.get(code)??(code==='reserve'?'Резерв':code==='rejected'?'Отказ':code==='no_show'?'Не вышел':code)]);
}
function unique(rows:RecruitingApplicationRow[],field:'objectId'|'ownerUserId',name:'object'|'owner'){return [...new Map(rows.filter(row=>row[field]).map(row=>[row[field]!,row[name]??'—'])).entries()]}
function Portal({children}:{children:React.ReactNode}){return typeof document==='undefined'?null:createPortal(children,document.body)}
