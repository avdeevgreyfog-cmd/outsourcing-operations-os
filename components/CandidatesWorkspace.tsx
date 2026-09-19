'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {RecruitingApplicationRow,RecruitingOptions} from '@/lib/recruiting/service';
import {recruitingStageLabels,contactChannelLabels} from '@/lib/recruiting/model';
import {useRecruitingApplications} from '@/lib/recruiting/demo-client';
import {formatWorkDate,isActiveStage,workRisks} from '@/lib/recruiting/workflow';
import {Status} from './UI';
import {RecruitingActionDrawer} from './RecruitingActionDrawer';
export function CandidatesWorkspace({rows,demo,exitReasons,canEdit,canConvert}:{rows:RecruitingApplicationRow[];demo:boolean;exitReasons:RecruitingOptions['exitReasons'];canEdit:boolean;canConvert:boolean}){
 const all=useRecruitingApplications(rows,demo);const [query,setQuery]=useState('');const [stage,setStage]=useState('all');const [queue,setQueue]=useState('all');const [object,setObject]=useState('all');const [owner,setOwner]=useState('all');const [source,setSource]=useState('all');const [view,setView]=useState('people');const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
 const people=new Set(all.map(x=>x.candidateId));
 const matching=all.filter(row=>{
  if(stage!=='all'&&row.stage!==stage)return false;
  if(object!=='all'&&row.objectId!==object)return false;
  if(owner!=='all'&&row.ownerUserId!==owner)return false;
  if(source!=='all'&&row.source!==source)return false;
  if(queue==='attention'&&!workRisks(row).length)return false;
  if(queue==='today'&&(!row.nextActionAt||new Date(row.nextActionAt).toDateString()!==new Date().toDateString()))return false;
  if(queue==='missing'&&(!isActiveStage(row.stage)||row.nextActionAt))return false;
  if(queue==='reserve'&&row.stage!=='reserve')return false;
  if(queue==='active'&&!isActiveStage(row.stage))return false;
  return `${row.fullName} ${row.phone??''} ${row.email??''} ${row.need} ${row.city??''} ${row.object??''} ${row.source??''} ${row.sourceCampaign??''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim());
 }).sort((a,b)=>(Number(isActiveStage(b.stage))-Number(isActiveStage(a.stage)))||(a.nextActionAt??'9999').localeCompare(b.nextActionAt??'9999'));
 const display=view==='applications'?matching:[...new Map([...matching].reverse().map(row=>[row.candidateId,row])).values()];
 const options=(field:'objectId'|'ownerUserId'|'source',name:'object'|'owner'|'source')=>[...new Map(all.filter(x=>x[field]).map(x=>[x[field]!,x[name]??'—'])).entries()];
 return <div className="recruiting-workspace">
 <div className="recruiting-summary"><div><span>Людей в базе</span><strong>{people.size}</strong></div><div><span>Активно в подборе</span><strong>{new Set(all.filter(x=>isActiveStage(x.stage)).map(x=>x.candidateId)).size}</strong></div><div><span>Вышли</span><strong>{new Set(all.filter(x=>x.stage==='started').map(x=>x.candidateId)).size}</strong></div><div><span>Повторные обращения</span><strong>{[...people].filter(id=>all.filter(x=>x.candidateId===id).length>1).length}</strong></div></div>
 <div className="recruiting-toolbar"><div className="segmented-control">{[['people','Люди'],['applications','Заявки на потребности']].map(([value,label])=><button key={value} aria-pressed={view===value} className={view===value?'active':''} onClick={()=>setView(value)}>{label}</button>)}</div><Link className="button" href="/needs?view=analytics">Аналитика источников</Link><Link className="button primary" href="/recruiting">Открыть воронку / добавить</Link></div>
 <div className="recruiting-toolbar"><input className="request-search" aria-label="Поиск кандидата" placeholder="Имя, телефон, город, потребность, кампания" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Рабочая очередь" value={queue} onChange={e=>setQueue(e.target.value)}>{[['all','Все'],['active','В работе'],['attention','Требуют действия'],['today','На сегодня'],['missing','Без действия'],['reserve','Резерв']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select aria-label="Этап" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">Все этапы</option>{Object.entries(recruitingStageLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{([{field:'objectId',name:'object',value:object,set:setObject,label:'Объект'},{field:'ownerUserId',name:'owner',value:owner,set:setOwner,label:'Рекрутер'},{field:'source',name:'source',value:source,set:setSource,label:'Источник'}] as const).map(f=><select key={f.field} aria-label={f.label} value={f.value} onChange={e=>f.set(e.target.value)}><option value="all">{f.label}: все</option>{options(f.field,f.name).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>)}<button className="button" onClick={()=>{setQuery('');setStage('all');setQueue('all');setObject('all');setOwner('all');setSource('all');}}>Сбросить</button></div>
 <p className="cell-sub">{view==='people'?'Одна строка на человека. Показана первая подходящая заявка; все заявки доступны в карточке.':'Каждая строка — отдельная заявка человека на потребность.'}</p>
 <div className="section section-flush"><div className="request-table-wrap"><table className="data-table"><thead><tr>{['Кандидат','Контакт','Источник / кампания','Потребность','Этап','Ответственный','Следующее действие','Последний контакт','Выход','Риски','История','Действия'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{display.map(row=>{const related=all.filter(x=>x.candidateId===row.candidateId);return <tr key={view==='people'?row.candidateId:row.applicationId}>
 <td><Link className="cell-title" href={`/candidates/${row.candidateId}`}>{row.fullName}</Link><span className="cell-sub">{row.city??'Город не указан'}</span></td>
 <td>{row.phone??row.email??'—'}<span className="cell-sub">{contactChannelLabels[row.preferredChannel??'']??''}</span></td><td>{row.source??'—'}<span className="cell-sub">{row.sourceCampaign??(row.sourceChannel!==row.source?row.sourceChannel:'')}</span></td><td>{row.need}<span className="cell-sub">{row.object??'Без объекта'}</span></td>
 <td><Status tone={row.stage==='started'?'good':['rejected','no_show'].includes(row.stage)?'bad':'neutral'}>{row.stageLabel}</Status><span className="cell-sub">С {formatWorkDate(row.stageEnteredAt)}</span></td><td>{row.owner??'Не назначен'}<span className="cell-sub">{row.manager??''}</span></td><td>{row.workflow?.nextActionText??'—'}<span className="cell-sub">{formatWorkDate(row.nextActionAt)}</span></td><td>{row.workflow?.lastContact??'—'}</td><td>{row.plannedStartDate??'—'}<span className="cell-sub">{row.workflow?.plannedShift??''}</span></td><td>{workRisks(row).join(' · ')||'—'}</td><td>Заявок: {related.length}<span className="cell-sub">Активных: {related.filter(x=>isActiveStage(x.stage)).length} · Объектов: {new Set(related.map(x=>x.objectId).filter(Boolean)).size}</span></td><td><button className="button" onClick={()=>setSelected(row)}>Открыть</button></td></tr>})}</tbody></table>{!display.length&&<div className="empty-inline">Нет кандидатов по выбранным условиям</div>}</div></div>
 {selected&&<RecruitingActionDrawer row={selected} demo={demo} canEdit={canEdit} canConvert={canConvert} exitReasons={exitReasons} onClose={()=>setSelected(null)}/>}
 </div>;
}
