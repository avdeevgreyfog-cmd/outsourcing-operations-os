'use client';

import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Pencil} from 'lucide-react';
import {Section} from '@/components/UI';
import {useUnsavedChanges} from '@/components/sales/SalesEditSection';
import type {WorkerEditorContext, WorkerEmploymentPeriod, WorkerProfileData} from '@/lib/operations/worker-editor-types';

type Props = {context: WorkerEditorContext; demo: boolean; block: 'profile' | 'employment'};
type PeriodDraft = Omit<WorkerEmploymentPeriod, 'id' | 'relationType'> & {id?: string; relationType:WorkerEmploymentPeriod['relationType'] | ''};
const labels: Record<keyof WorkerProfileData, string> = {fullName:'ФИО', phone:'Телефон', email:'Почта', city:'Город', birthDate:'Дата рождения', clothingSize:'Размер одежды', shoeSize:'Размер обуви', heightCm:'Рост, см', notes:'Примечание'};
const relationLabels = {employment:'Трудовой договор', gph:'ГПХ', npd:'Самозанятость (НПД)', custom:'Другое'};
const emptyPeriod: PeriodDraft = {relationType:'', effectiveFrom:'', effectiveTo:null, contractReference:null};
const maxLengths: Partial<Record<keyof WorkerProfileData, number>> = {fullName:240, phone:60, email:320, city:240, clothingSize:40, shoeSize:40, notes:3000};
const nullable = (value: string) => value.trim() || null;
const dateLabel = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('.') : 'Без даты окончания';

export function WorkerDataEditor(props: Props) {
  return <WorkerEditor key={`${props.context.workerId}-${props.block}`} {...props}/>;
}

function WorkerEditor({context, demo, block}: Props) {
  const router = useRouter();
  const id = useId();
  const [data, setData] = useState(context);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<WorkerProfileData>(context.profile);
  const [period, setPeriod] = useState<PeriodDraft>(emptyPeriod);
  const [reason, setReason] = useState('');
  const [initial, setInitial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [success, setSuccess] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const invokedId = useRef('');
  const wasOpen = useRef(false);
  const dirty = open && initial !== JSON.stringify(block === 'profile' ? profile : {period, reason});
  const canLeave = useUnsavedChanges(dirty || busy);
  const canEdit = context.canEdit && data.canEdit;

  useEffect(() => {
    if(open) formRef.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    else if(wasOpen.current) (document.getElementById(invokedId.current) || triggerRef.current)?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if(!busy) return;
    function preventNavigation(event: MouseEvent) {
      if(event.target instanceof Element && event.target.closest('a[href]')) {event.preventDefault(); event.stopImmediatePropagation();}
    }
    window.addEventListener('click', preventNavigation, true);
    return () => window.removeEventListener('click', preventNavigation, true);
  }, [busy]);

  function begin(value?: WorkerEmploymentPeriod, trigger?: HTMLButtonElement) {
    if(!canEdit || busy || (open && !canLeave())) return;
    // Start from the last response, retaining session-only demo edits.
    invokedId.current = trigger?.id || `${id}-edit`;
    const draft = value ? {...value} : {...emptyPeriod};
    setProfile({...data.profile}); setPeriod(draft); setReason('');
    setInitial(JSON.stringify(block === 'profile' ? data.profile : {period:draft, reason:''}));
    setError(''); setStale(false); setSuccess(''); setOpen(true);
  }
  function cancel() {
    if(busy || !canLeave()) return;
    setOpen(false); setError(''); setStale(false); triggerRef.current?.focus();
  }
  async function reload() {
    if(busy || !canLeave()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workers/${encodeURIComponent(data.workerId)}/profile`, {cache:'no-store'});
      const result = await response.json();
      if(!response.ok) throw new Error(result.error || 'Не удалось загрузить текущие данные.');
      setData(result); setOpen(false); setError(''); setStale(false); setSuccess('Текущие данные загружены. Откройте редактирование заново.');
      triggerRef.current?.focus(); router.refresh();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Не удалось загрузить текущие данные.');}
    finally {setBusy(false);}
  }
  function validate() {
    if(block === 'profile') {
      if(profile.fullName.trim().length < 2) return 'Укажите ФИО: минимум 2 символа.';
      if(profile.fullName.trim().length > 240) return 'ФИО: не более 240 символов.';
      if(profile.heightCm !== null && (!Number.isInteger(profile.heightCm) || profile.heightCm < 100 || profile.heightCm > 250)) return 'Рост должен быть целым числом от 100 до 250 см.';
      if(profile.birthDate && profile.birthDate > new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Moscow'})) return 'Дата рождения не может быть в будущем.';
    } else {
      if(!period.relationType) return 'Выберите тип оформления.';
      if(!period.effectiveFrom) return 'Укажите начало периода.';
      if(period.effectiveTo && period.effectiveTo < period.effectiveFrom) return 'Конец периода не может быть раньше начала.';
      if(reason.trim().length < 3) return 'Укажите причину изменения: минимум 3 символа.';
      if(data.relations.some(item => item.id !== period.id && item.effectiveFrom <= (period.effectiveTo || '9999-12-31') && (item.effectiveTo || '9999-12-31') >= period.effectiveFrom)) return 'Периоды пересекаются. Даты начала и окончания включены в период; скорректируйте границы существующего периода отдельно.';
    }
    return '';
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy || stale || !canEdit) return;
    const problem = validate(); if(problem) {setError(problem); return;}
    setBusy(true); setError('');
    try {
      const cleanProfile: WorkerProfileData = {...profile, fullName:profile.fullName.trim(), phone:profile.phone ? nullable(profile.phone) : null, email:profile.email ? nullable(profile.email) : null, city:profile.city ? nullable(profile.city) : null, clothingSize:profile.clothingSize ? nullable(profile.clothingSize) : null, shoeSize:profile.shoeSize ? nullable(profile.shoeSize) : null, notes:profile.notes ? nullable(profile.notes) : null};
      const cleanPeriod = {...period, relationType:period.relationType as WorkerEmploymentPeriod['relationType'], contractReference:period.contractReference ? nullable(period.contractReference) : null};
      if(demo) {
        const event = {id:crypto.randomUUID(), date:new Date().toISOString(), summary:block === 'profile' ? 'Изменены личные данные (демо)' : 'Изменён период оформления (демо)', actor:'Текущая демо-сессия', reason:block === 'employment' ? reason.trim() : null};
        setData({...data, profile:block === 'profile' ? cleanProfile : data.profile, relations:block === 'employment' ? [...data.relations.filter(item => item.id !== period.id), {...cleanPeriod, id:period.id || crypto.randomUUID()}].sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom)) : data.relations, events:[event, ...data.events]});
      } else {
        const body = block === 'profile' ? {action:'profile', expectedVersion:data.profileVersion, profile:cleanProfile} : {action:'period', expectedVersion:data.relationsVersion, period:cleanPeriod, reason:reason.trim()};
        const response = await fetch(`/api/workers/${encodeURIComponent(data.workerId)}/profile`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        const result = await response.json();
        if(response.status === 409) {
          const message = typeof result.error === 'string' ? result.error : 'Не удалось сохранить: конфликт данных.';
          if(/изменились|после открытия|уже изменён/.test(message)) setStale(true);
          throw new Error(`${message} Ваш ввод сохранён в форме.`);
        }
        if(!response.ok) throw new Error(result.error || 'Не удалось сохранить изменения.');
        setData(result); router.refresh();
      }
      setOpen(false); setSuccess(demo ? 'Изменения применены только в этой демо-сессии. После перехода в другой раздел или перезагрузки они исчезнут.' : 'Изменения сохранены.'); triggerRef.current?.focus();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.');}
    finally {setBusy(false);}
  }
  const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Moscow'});
  const descriptionId = `${id}-note`;
  return <Section className="worker-data-editor" title={block === 'profile' ? 'Личные данные' : 'Оформление'} actions={canEdit && !open ? <button ref={triggerRef} id={`${id}-edit`} type="button" className="button worker-edit-trigger" onClick={event => begin(undefined, event.currentTarget)}><Pencil size={13}/>{block === 'profile' ? 'Редактировать' : 'Добавить период'}</button> : undefined}>
    <div className="worker-editor-body">
    {demo && <p className="worker-editor-note">Демо: изменения действуют, пока открыт этот раздел. После перехода или перезагрузки они исчезнут.</p>}
    {!canEdit && <p className="worker-editor-note">Редактирование недоступно для вашей роли или области доступа.</p>}
    {block === 'employment' && <p id={descriptionId} className="worker-editor-note">Тип оформления не подтверждает наличие подписанного договора. Номер / основание необязательны. Старый период не закрывается автоматически; границы включены в период.</p>}
    {open ? <form ref={formRef} onSubmit={save} onKeyDown={event => {if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); cancel();}}} aria-busy={busy} aria-describedby={error ? `${id}-error` : block === 'employment' ? descriptionId : undefined}>
      <fieldset disabled={busy || !canEdit} className="worker-editor-fields">
        <legend className="sr-only">{block === 'profile' ? 'Изменение личных данных' : period.id ? 'Изменение периода' : 'Новый период'}</legend>
        {block === 'profile' ? (Object.keys(labels) as (keyof WorkerProfileData)[]).map(key => <label key={key} className={key === 'notes' || key === 'fullName' ? 'worker-field-wide' : undefined}>{labels[key]}{key === 'notes' ? <textarea value={profile.notes || ''} maxLength={3000} onChange={event => setProfile({...profile, notes:event.target.value || null})}/> : <input type={key === 'birthDate' ? 'date' : key === 'heightCm' ? 'number' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={profile[key] ?? ''} required={key === 'fullName'} min={key === 'heightCm' ? 100 : undefined} max={key === 'heightCm' ? 250 : key === 'birthDate' ? new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Moscow'}) : undefined} maxLength={maxLengths[key]} onChange={event => setProfile({...profile, [key]:key === 'heightCm' ? event.target.value === '' ? null : Number(event.target.value) : key === 'fullName' ? event.target.value : event.target.value || null})}/>}</label>) : <>
          <label className="worker-field-wide">Тип оформления<select required value={period.relationType} onChange={event => setPeriod({...period, relationType:event.target.value as PeriodDraft['relationType']})}><option value="">Выберите тип оформления</option>{Object.entries(relationLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Начало периода<input type="date" required value={period.effectiveFrom} onChange={event => setPeriod({...period, effectiveFrom:event.target.value})}/></label>
          <label>Конец периода<input type="date" min={period.effectiveFrom || undefined} value={period.effectiveTo || ''} onChange={event => setPeriod({...period, effectiveTo:event.target.value || null})}/></label>
          <label className="worker-field-wide">Номер / основание<input value={period.contractReference || ''} maxLength={240} onChange={event => setPeriod({...period, contractReference:event.target.value || null})}/></label>
          <label className="worker-field-wide">Причина изменения<textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label>
        </>}
      </fieldset>
      {error && <p id={`${id}-error`} className="worker-editor-error" role="alert">{error}</p>}
      <div className="worker-editor-actions"><button type="submit" className="button worker-editor-save" disabled={busy || stale || !canEdit}>{busy ? 'Сохранение…' : 'Сохранить'}</button><button type="button" className="button" disabled={busy} onClick={cancel}>Отмена</button>{stale && !demo && <button type="button" className="button" disabled={busy} onClick={reload}>Загрузить текущие данные</button>}</div>
    </form> : block === 'profile' ? <dl className="worker-profile-values">{(Object.keys(labels) as (keyof WorkerProfileData)[]).map(key => <div key={key}><dt>{labels[key]}</dt><dd>{key === 'birthDate' && data.profile[key] ? dateLabel(data.profile[key]) : data.profile[key] ?? '—'}</dd></div>)}</dl> : <div className="worker-period-list">{data.relations.length ? data.relations.map(item => <div className="worker-period" key={item.id}><div><strong>{relationLabels[item.relationType]}</strong><span className={`worker-period-status ${item.effectiveFrom > today ? 'planned' : item.effectiveTo && item.effectiveTo < today ? 'ended' : 'current'}`}><i/>{item.effectiveFrom > today ? 'Запланирован' : item.effectiveTo && item.effectiveTo < today ? 'Завершён' : 'Действует'}</span><p>{dateLabel(item.effectiveFrom)} — {dateLabel(item.effectiveTo)}</p><p>Номер / основание: {item.contractReference || 'Не указаны'}</p></div>{canEdit && <button type="button" className="button worker-edit-trigger" id={`${id}-period-${item.id}`} onClick={event => begin(item, event.currentTarget)} aria-label={`Редактировать период ${dateLabel(item.effectiveFrom)}`}><Pencil size={13}/>Редактировать</button>}</div>) : <p className="worker-editor-note">Периоды оформления не указаны.</p>}</div>}
    {success && <p className="worker-editor-success" role="status">{success}</p>}
    <details className="worker-edit-history"><summary>История изменений{data.events.length ? ` (${data.events.length})` : ''}</summary>{data.events.length ? <ol>{data.events.map(event => <li key={event.id}><strong>{event.summary}</strong><span>{new Date(event.date).toLocaleString('ru-RU', {timeZone:'Europe/Moscow'})} · {event.actor || 'Автор не указан'}</span>{event.reason && <p>Причина: {event.reason}</p>}{event.detail && <p>{event.detail}</p>}</li>)}</ol> : <p className="worker-editor-note">Изменений в редакторе пока нет.</p>}</details>
    </div>
  </Section>;
}
