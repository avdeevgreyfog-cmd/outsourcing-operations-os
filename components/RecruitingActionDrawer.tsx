'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {SalesDrawer} from '@/components/sales/SalesUI';
import type {RecruitingApplicationRow, RecruitingOptions} from '@/lib/recruiting/service';
import {recruitingStages,recruitingTerminalStages,recruitingStageLabels,type RecruitingStage} from '@/lib/recruiting/model';
import {reserveReasons,workRisks,formatWorkDate} from '@/lib/recruiting/workflow';
import {saveApplicationChange} from '@/lib/recruiting/client-actions';
export function RecruitingActionDrawer({row,initialStage,exitReasons,demo,canEdit,canConvert,onClose,onSaved}:{row:RecruitingApplicationRow;initialStage?:RecruitingStage;exitReasons:RecruitingOptions['exitReasons'];demo:boolean;canEdit:boolean;canConvert:boolean;onClose:()=>void;onSaved?:()=>void}){
 const router=useRouter();const [stage,setStage]=useState(initialStage??row.stage);const [workflow,setWorkflow]=useState(row.workflow??{});const [next,setNext]=useState(localDate(row.nextActionAt));const [planned,setPlanned]=useState(row.plannedStartDate??'');const [actual,setActual]=useState('');const [reason,setReason]=useState('');const [code,setCode]=useState(row.rejectionReasonCode??'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const risks=workRisks(row);
 async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const fields=new FormData(event.currentTarget);const nextValue=String(fields.get('nextActionAt')??'');const plannedValue=String(fields.get('plannedStartDate')??planned);const actualValue=String(fields.get('actualStartAt')??'');const reviewValue=String(fields.get('reviewDueAt')??'');setBusy(true);setError('');try{await saveApplicationChange(row,{stage,workflow:{...workflow,...(stage==='manager_review'?{reviewDueAt:reviewValue?new Date(reviewValue).toISOString():undefined}:{})},nextActionAt:nextValue?new Date(nextValue).toISOString():null,plannedStartDate:plannedValue||null,actualStartAt:actualValue?new Date(actualValue).toISOString():null,reason,reasonCode:code||undefined},demo);router.refresh();onSaved?.();onClose();}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить');}finally{setBusy(false);}}
 return <SalesDrawer title={row.fullName} subtitle={`${row.need} · ${row.object??'Без объекта'}`} onClose={()=>{if(!busy)onClose();}}><form onSubmit={save} className="recruiting-form">
 <p>{row.phone??row.email??'Контакт не указан'} · {row.owner??'Рекрутер не назначен'}</p>
 {risks.length>0&&<p className="needs-overdue">{risks.join(' · ')}</p>}
 <p className="cell-sub">На этапе с {formatWorkDate(row.stageEnteredAt)} МСК. Даты в полях ввода — по времени вашего устройства.</p>
 {error&&<div role="alert" className="recruiting-error">{error}</div>}
 <fieldset disabled={busy||!canEdit} className="recruiting-action-fields">
 <label>Этап<select value={stage} onChange={e=>setStage(e.target.value as RecruitingStage)}>{[...recruitingStages,...recruitingTerminalStages].map(value=><option key={value} value={value} disabled={(value==='started'&&!canConvert)||(row.stage==='started'&&value!=='started')}>{recruitingStageLabels[value]}</option>)}</select></label>
 <label>Последний результат общения<textarea value={workflow.lastContact??''} onChange={e=>setWorkflow(x=>({...x,lastContact:e.target.value}))}/></label>
 <label>Следующее действие<input value={workflow.nextActionText??''} onChange={e=>setWorkflow(x=>({...x,nextActionText:e.target.value}))} placeholder="Например: уточнить готовность к выезду"/></label>
 <label>Срок следующего действия<input name="nextActionAt" type="datetime-local" value={next} onChange={e=>setNext(e.target.value)}/></label>
 {stage==='manager_review'&&<><label>Кто принимает решение<input required value={workflow.reviewRecipient??''} onChange={e=>setWorkflow(x=>({...x,reviewRecipient:e.target.value}))}/></label><label>Срок решения<input required name="reviewDueAt" type="datetime-local" value={localDate(workflow.reviewDueAt)} onChange={e=>setWorkflow(x=>({...x,reviewDueAt:e.target.value?new Date(e.target.value).toISOString():undefined}))}/></label></>}
 {['preparation','ready','started'].includes(stage)&&<><label>Плановая дата выхода<input name="plannedStartDate" type="date" value={planned} onChange={e=>setPlanned(e.target.value)}/></label><label>Смена<input value={workflow.plannedShift??''} onChange={e=>setWorkflow(x=>({...x,plannedShift:e.target.value}))} placeholder="Дневная · 08:00–20:00"/></label><label><input type="checkbox" checked={workflow.confirmed??false} onChange={e=>setWorkflow(x=>({...x,confirmed:e.target.checked}))}/> Кандидат подтвердил дату и смену</label><label><input type="checkbox" checked={workflow.readiness??false} onChange={e=>setWorkflow(x=>({...x,readiness:e.target.checked}))}/> Требуемые документы, допуски и логистика проверены</label></>}
 {stage==='started'&&row.stage!=='started'&&<label>Фактическое время выхода<input required name="actualStartAt" type="datetime-local" value={actual} onChange={e=>setActual(e.target.value)}/></label>}
 {stage==='reserve'&&<label>Причина резерва<select required value={workflow.reserveReason??''} onChange={e=>setWorkflow(x=>({...x,reserveReason:e.target.value}))}><option value="">Выберите причину</option>{reserveReasons.map(r=><option key={r}>{r}</option>)}</select></label>}
 {['rejected','no_show'].includes(stage)&&<label>Причина выбытия<select required value={code} onChange={e=>setCode(e.target.value)}><option value="">Выберите причину</option>{exitReasons.filter(x=>x.kind===stage||x.kind==='both').map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label>}
 {stage!==row.stage&&<label>{stage==='approved'?'Решение согласующего':'Комментарий к переходу'}<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="При возврате и пропуске этапов укажите причину"/></label>}
 </fieldset><div className="recruiting-form-actions"><Link className="button" href={`/candidates/${row.candidateId}`}>Полная карточка</Link>{canEdit&&<button className="button primary" disabled={busy}>{busy?'Сохраняю…':'Сохранить'}</button>}</div>
 </form></SalesDrawer>;
}
function localDate(value?:string|null){if(!value||!Number.isFinite(Date.parse(value)))return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
