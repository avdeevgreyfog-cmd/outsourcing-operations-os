"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ObjectRow } from "@/lib/data/service";
import type { ObjectManagementOptions } from "@/lib/operations/object-management";
import { Section } from "@/components/UI";

type RequisitesEditor={kind:"client"|"legalEntity";id:string;name:string;inn:string;kpp:string;legalName:string;version:string};

const statusOptions=[
  ["prelaunch","Подготовка"],["launch","Запуск"],["active","Активен"],["paused","Приостановлен"],["completed","Завершён"],["archived","Архив"],
] as const;

export function ObjectSettingsWorkspace({object,options,demo,canAssign}:{object:ObjectRow;options:ObjectManagementOptions;demo:boolean;canAssign:boolean}){
  const router=useRouter();
  const [view,setView]=useState<"general"|"team"|"recruiting"|"personnel">("general");
  const [editing,setEditing]=useState<"general"|"team"|"recruiting"|"personnel"|null>(null);
  const [requisites,setRequisites]=useState<RequisitesEditor|null>(null);
  const [version,setVersion]=useState(object.editVersion??"");
  const [name,setName]=useState(object.name);
  const [legalEntityId,setLegalEntityId]=useState(object.legalEntityId??"");
  const [clientId,setClientId]=useState(object.clientId??"");
  const [regionId,setRegionId]=useState(object.regionId??"");
  const [address,setAddress]=useState(object.address??"");
  const [targetStartDate,setTargetStartDate]=useState(object.targetStartDate??toInputDate(object.targetStart??null));
  const [actualStartDate,setActualStartDate]=useState(object.actualStartDate??"");
  const [actualEndDate,setActualEndDate]=useState(object.actualEndDate??"");
  const [status,setStatus]=useState(object.status);
  const [ownerUserId,setOwnerUserId]=useState(object.ownerUserId??"");
  const [additionalManagers,setAdditionalManagers]=useState<string[]>(()=> (object.additionalManagers??[]).map(item=>item.userId));
  const [recruitingMode,setRecruitingMode]=useState<"company_rules"|"object_team">(object.recruitingMode??"company_rules");
  const [recruiters,setRecruiters]=useState<string[]>(object.recruitingTeam?.map(item=>item.userId)??[]);
  const [transitionDays,setTransitionDays]=useState(String(object.defaultTransitionDays??7));
  const [dailyPaymentShifts,setDailyPaymentShifts]=useState(String(object.defaultDailyPaymentShifts??0));
  const [scheduleWorkDays,setScheduleWorkDays]=useState(object.defaultScheduleWorkDays==null?"":String(object.defaultScheduleWorkDays));
  const [scheduleRestDays,setScheduleRestDays]=useState(object.defaultScheduleRestDays==null?"":String(object.defaultScheduleRestDays));
  const [defaultShiftKind,setDefaultShiftKind]=useState<"day"|"night"|"mixed">(object.defaultShiftKind??"mixed");
  const [ppeTaskEnabled,setPpeTaskEnabled]=useState(object.ppeTaskEnabled!==false);
  const [ppeTaskDueDays,setPpeTaskDueDays]=useState(object.ppeTaskDueDays==null?"":String(object.ppeTaskDueDays));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [conflict,setConflict]=useState(false);
  const [saved,setSaved]=useState("");

  const previousOwner=object.ownerUserId&&ownerUserId!==object.ownerUserId?options.managers.find(item=>item.id===object.ownerUserId):null;
  const visibleAdditional=useMemo(()=>additionalManagers.filter(id=>id!==ownerUserId),[additionalManagers,ownerUserId]);
  const launchManaged=["prelaunch","launch"].includes(object.status);
  const operationalStatusOptions=statusOptions.filter(([value])=>["active","paused","completed","archived"].includes(value));

  function toggle(list:string[],set:(value:string[])=>void,id:string){set(list.includes(id)?list.filter(value=>value!==id):[...list,id]);}
  function changeStatus(next:string){
    setStatus(next);
    if(["prelaunch","launch","active","paused"].includes(next)&&["completed","archived"].includes(status))setActualEndDate("");
  }

  function cancel(){
    setName(object.name);setClientId(object.clientId??"");setRegionId(object.regionId??"");setLegalEntityId(object.legalEntityId??"");setAddress(object.address??"");
    setTargetStartDate(object.targetStartDate??toInputDate(object.targetStart??null));
    setActualStartDate(object.actualStartDate??"");setActualEndDate(object.actualEndDate??"");setStatus(object.status);
    setOwnerUserId(object.ownerUserId??"");setAdditionalManagers((object.additionalManagers??[]).map(item=>item.userId));
    setRecruitingMode(object.recruitingMode??"company_rules");setRecruiters(object.recruitingTeam?.map(item=>item.userId)??[]);
    setTransitionDays(String(object.defaultTransitionDays??7));setDailyPaymentShifts(String(object.defaultDailyPaymentShifts??0));
    setScheduleWorkDays(object.defaultScheduleWorkDays==null?"":String(object.defaultScheduleWorkDays));
    setScheduleRestDays(object.defaultScheduleRestDays==null?"":String(object.defaultScheduleRestDays));
    setDefaultShiftKind(object.defaultShiftKind??"mixed");setPpeTaskEnabled(object.ppeTaskEnabled!==false);
    setPpeTaskDueDays(object.ppeTaskDueDays==null?"":String(object.ppeTaskDueDays));
    setVersion(object.editVersion??"");setError("");setSaved("");setConflict(false);setEditing(null);setRequisites(null);
  }

  async function openRequisites(kind:"client"|"legalEntity"){
    const id=kind==="client"?clientId:legalEntityId;if(!id||busy)return;
    setBusy(true);setError("");setSaved("");
    const selectedName=kind==="client"?(options.clients.find(item=>item.id===id)?.name??object.client):(options.legalEntities.find(item=>item.id===id)?.name??object.legalEntity);
    try{
      if(demo){setRequisites({kind,id,name:selectedName??"Реквизиты",inn:"",kpp:"",legalName:"",version:"demo"});return;}
      const response=await fetch(`/api/objects/options?kind=${kind}&id=${id}`);
      const json=await response.json();if(!response.ok)throw new Error(json.error??"Не удалось загрузить реквизиты");
      setRequisites({kind,id,name:selectedName??"Реквизиты",inn:json.inn??"",kpp:json.kpp??"",legalName:json.legalName??"",version:json.version});
    }catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить реквизиты");}finally{setBusy(false);}
  }
  async function saveRequisites(){
    if(!requisites||busy)return;setBusy(true);setError("");setSaved("");
    try{
      if(demo){setRequisites(null);setSaved("Реквизиты изменены только в демо; в базу не записаны.");return;}
      const response=await fetch("/api/objects/options",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({kind:requisites.kind,id:requisites.id,version:requisites.version,inn:requisites.inn||null,...(requisites.kind==="client"?{legalName:requisites.legalName||null}:{kpp:requisites.kpp||null})})});
      const json=await response.json();if(!response.ok)throw new Error(json.error??"Не удалось сохранить реквизиты");
      setRequisites(null);setSaved("Реквизиты сохранены");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить реквизиты");}finally{setBusy(false);}
  }

  async function save(){
    if(busy||!editing||requisites)return;
    try{
      setBusy(true);setError("");setSaved("");setConflict(false);
      if(editing==="team"&&!ownerUserId)throw new Error("Выберите основного менеджера");
      if(editing==="recruiting"&&recruitingMode==="object_team"&&!recruiters.length)throw new Error("Выберите команду подбора");
      if(editing==="general"&&name.trim().length<2)throw new Error("Укажите название объекта — минимум 2 символа");
      if(editing==="personnel"&&((scheduleWorkDays&&!scheduleRestDays)||(!scheduleWorkDays&&scheduleRestDays)))throw new Error("Для графика укажите и рабочие, и выходные дни");
      if(editing==="general"&&actualStartDate&&actualEndDate&&actualEndDate<actualStartDate)throw new Error("Дата завершения не может быть раньше даты начала работы");
      if(demo){
        setEditing(null);
        setSaved("Изменения применены локально для демо. После обновления страницы исходные данные восстановятся.");
        return;
      }
      const payload={expectedVersion:version,
        ...(editing==="general"?{
          name,address:address||null,...(!launchManaged?{targetStartDate:targetStartDate||null,status}:{}),
          actualStartDate:actualStartDate||null,actualEndDate:actualEndDate||null,
          ...(canAssign?{legalEntityId:legalEntityId||null,clientId:clientId||null,regionId:regionId||null}:{}),
        }:{}),
        ...(editing==="personnel"?{
          defaultTransitionDays:Number(transitionDays),defaultDailyPaymentShifts:Number(dailyPaymentShifts||0),
          defaultScheduleWorkDays:scheduleWorkDays?Number(scheduleWorkDays):null,
          defaultScheduleRestDays:scheduleRestDays?Number(scheduleRestDays):null,
          defaultShiftKind,ppeTaskEnabled,ppeTaskDueDays:ppeTaskDueDays?Number(ppeTaskDueDays):null,
        }:{}),
        ...(editing==="team"?{
          ...(ownerUserId!==object.ownerUserId?{ownerUserId,keepPreviousManager:true}:{}),
          ...(JSON.stringify([...additionalManagers].sort())!==JSON.stringify((object.additionalManagers??[]).map(item=>item.userId).sort())?{additionalManagerUserIds:visibleAdditional}:{}),
        }:{}),
        ...(editing==="recruiting"?{recruitingMode,recruiterUserIds:recruitingMode==="object_team"?recruiters:[]}:{}),
      };
      const response=await fetch(`/api/objects/${object.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const json=await response.json().catch(()=>({}));
      if(!response.ok){setConflict(response.status===409);throw new Error(json.error??"Не удалось сохранить настройки");}
      setEditing(null);
      setVersion(json.version);
      setSaved("Настройки объекта сохранены");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить настройки");}
    finally{setBusy(false);}
  }

  return <div className="object-module-shell object-settings-workspace">
    <div className="object-module-head"><div><h2>Настройки объекта</h2><p>Параметры, ответственность, подбор и условия работы сотрудников.</p></div></div>
    <div className="object-local-tabs" aria-label="Разделы настроек">{([["general","Параметры и основание"],["team","Команда объекта"],["recruiting","Подбор"],["personnel","Условия работы"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={view===key} disabled={editing!==null||busy||requisites!==null} className={view===key?"active":""} onClick={()=>setView(key)}>{label}</button>)}</div>
    <div className="object-settings-layout">
    <div hidden={view!=="general"} className="object-view-content">
    <Section title="Параметры объекта" actions={<button className="button" disabled={busy||editing!==null} onClick={()=>{setError("");setSaved("");setEditing("general");}}>Редактировать</button>}>
      <fieldset disabled={busy||editing!=="general"} className="object-settings-form">
        <label>Название объекта<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Клиент{canAssign?<select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Не указано</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>:<input value={object.client??"Не указано"} disabled/>}{clientId&&options.requisitesPermissions?.client&&<button type="button" className="button" disabled={busy||requisites!==null} onClick={()=>void openRequisites("client")}>Дополнить реквизиты</button>}</label>
        <label>Регион{canAssign?<select value={regionId} onChange={e=>setRegionId(e.target.value)}><option value="">Не указано</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>:<input value={object.region??"Не указано"} disabled/>}</label>
        <label>Наше юрлицо{canAssign?<select value={legalEntityId} onChange={e=>setLegalEntityId(e.target.value)}><option value="">Выберите юрлицо</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.shortName??item.name}</option>)}</select>:<input value={object.legalEntity??"Не указано"} disabled/>}{legalEntityId&&options.requisitesPermissions?.legalEntity&&<button type="button" className="button" disabled={busy||requisites!==null} onClick={()=>void openRequisites("legalEntity")}>Дополнить реквизиты</button>}</label>
        <label className="wide">Адрес<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Адрес объекта"/></label>
        {launchManaged
          ?<label>Плановая дата запуска<div className="object-launch-managed-field"><strong>{targetStartDate?new Intl.DateTimeFormat("ru-RU").format(new Date(targetStartDate+"T00:00:00")):"Не указана"}</strong><Link href={"/launches?object="+object.id}>Открыть план запуска</Link></div><small>На этапе подготовки дата управляется из плана запуска.</small></label>
          :<label>Плановая дата запуска<input type="date" value={targetStartDate} onChange={e=>setTargetStartDate(e.target.value)}/><small>Историческая плановая дата объекта.</small></label>}
        {launchManaged
          ?<label>Статус объекта<div className="object-launch-managed-field"><strong>{statusOptions.find(([value])=>value===status)?.[1]??status}</strong><Link href={"/launches?object="+object.id}>Управлять запуском</Link></div><small>Первый фактический выход переводит объект в «Запуск», завершение стабилизации — в «Активен».</small></label>
          :<label>Статус объекта<select value={status} onChange={e=>changeStatus(e.target.value)}>{operationalStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><small>После завершения запуска здесь доступны операционные статусы объекта.</small></label>}
        {["active","paused","completed","archived"].includes(status)&&<label>Фактическая дата начала работы<input type="date" value={actualStartDate} onChange={e=>setActualStartDate(e.target.value)}/><small>{actualStartDate?"От этой даты считается период работы объекта.":"Дата неизвестна"}</small></label>}
        {["completed","archived"].includes(status)&&<label>Дата завершения работы<input type="date" value={actualEndDate} onChange={e=>setActualEndDate(e.target.value)}/><small>Фиксирует итоговый период работы объекта.</small></label>}
      </fieldset>
    </Section>

    {requisites&&<Section title={"Реквизиты: "+requisites.name}>
      <p className="form-hint">Сведения сохраняются в общей карточке {requisites.kind==="client"?"клиента":"нашего юрлица"} и используются всеми связанными объектами. Неизвестные значения оставьте пустыми.</p>
      <fieldset disabled={busy} className="object-settings-form">
        {requisites.kind==="client"&&<label className="wide">Полное юридическое название<input value={requisites.legalName} onChange={e=>setRequisites({...requisites,legalName:e.target.value})} placeholder="Не указано"/></label>}
        <label>ИНН<input value={requisites.inn} onChange={e=>setRequisites({...requisites,inn:e.target.value})} maxLength={20} placeholder="Не указано"/></label>
        {requisites.kind==="legalEntity"&&<label>КПП<input value={requisites.kpp} onChange={e=>setRequisites({...requisites,kpp:e.target.value})} maxLength={20} placeholder="Не указано"/></label>}
      </fieldset>
      <div className="object-settings-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void saveRequisites()}>Сохранить реквизиты</button><button type="button" className="button" disabled={busy} onClick={()=>setRequisites(null)}>Закрыть без сохранения</button></div>
    </Section>}

    <Section title="Основание объекта">
      <div className="object-source-links">
        {object.sourceRequestId&&<Link href={`/requests/${object.sourceRequestId}`}>Исходная заявка <span>→</span></Link>}
        {object.sourceProposalId&&<Link href={`/proposals/${object.sourceProposalId}`}>Согласованное КП <span>→</span></Link>}
        {!object.sourceRequestId&&!object.sourceProposalId&&<div><strong>Добавлен вручную</strong></div>}
      </div>
    </Section>

    </div>
    <div hidden={view!=="team"} className="object-view-content">
    <Section title="Команда объекта" actions={canAssign&&<button className="button" disabled={busy||editing!==null} onClick={()=>{setError("");setSaved("");setEditing("team");}}>Редактировать</button>}>
      {canAssign?<fieldset disabled={busy||editing!=="team"} className="object-settings-form">
        <label>Основной менеджер<select value={ownerUserId} onChange={e=>{setOwnerUserId(e.target.value);setAdditionalManagers(current=>current.filter(id=>id!==e.target.value))}}><option value="">Выберите менеджера</option>{object.ownerUserId&&!options.managers.some(item=>item.id===object.ownerUserId)&&<option value={object.ownerUserId}>{object.ownerName??"Текущий менеджер"}</option>}{options.managers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="wide object-assignment-picker"><span>Дополнительные менеджеры</span><div>{options.managers.filter(item=>item.id!==ownerUserId).map(item=><label key={item.id}><input type="checkbox" checked={visibleAdditional.includes(item.id)} onChange={()=>toggle(visibleAdditional,setAdditionalManagers,item.id)}/><span>{item.name}</span></label>)}</div></div>
        {previousOwner&&<div className="wide object-handover-note"><strong>Передача объекта</strong><span>{previousOwner.name} останется дополнительным менеджером после назначения нового основного. Его можно снять отдельным сохранением после завершения передачи.</span></div>}
      </fieldset>:<div className="object-settings-readonly"><div><span>Основной менеджер</span><strong>{object.ownerName??"Не назначен"}</strong></div><div><span>Дополнительные менеджеры</span><strong>{object.additionalManagers?.map(item=>item.name).join(", ")||"Нет"}</strong></div><small>Изменение команды доступно руководителю с правом назначения ответственных объекта.</small></div>}
    </Section>

    </div>
    <div hidden={view!=="recruiting"} className="object-view-content">
    <Section title="Маршрутизация подбора" actions={canAssign&&<button className="button" disabled={busy||editing!==null} onClick={()=>{setError("");setSaved("");setEditing("recruiting");}}>Редактировать</button>}>
      {canAssign?<fieldset disabled={busy||editing!=="recruiting"} className="object-settings-form">
        <label className="wide">Новые потребности<select value={recruitingMode} onChange={e=>setRecruitingMode(e.target.value as "company_rules"|"object_team")}><option value="company_rules">По правилам компании</option><option value="object_team">Закреплённая команда объекта</option></select></label>
        {recruitingMode==="company_rules"
          ?<div className="wide object-routing-note">Новая потребность попадёт ответственному, определённому правилами компании. Руководитель подбора сможет распределить её между рекрутерами и задать каждому план.</div>
          :<div className="wide object-assignment-picker"><span>Закреплённая команда подбора</span><div>{options.recruiters.map(item=><label key={item.id}><input type="checkbox" checked={recruiters.includes(item.id)} onChange={()=>toggle(recruiters,setRecruiters,item.id)}/><span>{item.name}</span></label>)}</div><small>Все новые потребности объекта будут сразу доступны выбранным сотрудникам. Квоты автоматически не распределяются.</small></div>}
      </fieldset>:<div className="object-settings-readonly"><div><span>Маршрут</span><strong>{object.recruitingMode==="object_team"?"Закреплённая команда объекта":"По правилам компании"}</strong></div>{object.recruitingMode==="object_team"&&<div><span>Команда подбора</span><strong>{object.recruitingTeam?.map(item=>item.name).join(", ")||"Не назначена"}</strong></div>}<small>Маршрутизация новых потребностей изменяется руководителем объекта или направления.</small></div>}
    </Section>

    </div>
    <div hidden={view!=="personnel"} className="object-view-content">
    <Section title="Работа с персоналом" actions={<button className="button" disabled={busy||editing!==null} onClick={()=>{setError("");setSaved("");setEditing("personnel");}}>Редактировать</button>}>
      <fieldset disabled={busy||editing!=="personnel"} className="object-settings-form">
        <label>Период адаптации, дней<input type="number" min="0" max="90" value={transitionDays} onChange={e=>setTransitionDays(e.target.value)}/><small>По умолчанию 7 дней после первого подтверждённого выхода.</small></label>
        <label>Ежедневная выплата, первых смен<input type="number" min="0" max="31" value={dailyPaymentShifts} onChange={e=>setDailyPaymentShifts(e.target.value)}/><small>0 — обычный график выплат. У сотрудника значение можно будет переопределить.</small></label>
        <label>Рабочих дней в цикле<input type="number" min="1" max="31" value={scheduleWorkDays} onChange={e=>setScheduleWorkDays(e.target.value)} placeholder="Например, 5"/></label>
        <label>Выходных дней в цикле<input type="number" min="0" max="31" value={scheduleRestDays} onChange={e=>setScheduleRestDays(e.target.value)} placeholder="Например, 2"/></label>
        <label>Смена по умолчанию<select value={defaultShiftKind} onChange={e=>setDefaultShiftKind(e.target.value as "day"|"night"|"mixed")}><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select></label>
        <label className="operations-check object-settings-check"><input type="checkbox" checked={ppeTaskEnabled} onChange={e=>setPpeTaskEnabled(e.target.checked)}/> Создавать напоминание по СИЗ после первого выхода</label>
        {ppeTaskEnabled&&<label>Срок напоминания по СИЗ, дней<input type="number" min="0" max="90" value={ppeTaskDueDays} onChange={e=>setPpeTaskDueDays(e.target.value)} placeholder="Без жёсткого срока"/><small>Можно оставить пустым: задача появится без обязательной даты.</small></label>}
        <div className="wide object-routing-note">Изменение этих значений влияет только на новых назначенных сотрудников. Уже начавшим работу сохраняются их собственные настройки.</div>
      </fieldset>
    </Section>

    </div>
    <div className="object-settings-actions">{editing&&<><button className="button primary" disabled={busy||requisites!==null} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить настройки"}</button><button className="button" disabled={busy} onClick={cancel}>Отменить изменения</button></>}{error&&<span role="alert" className="form-error">{error}</span>}{conflict&&<button className="button" disabled={busy} onClick={()=>{if(window.confirm("Загрузить актуальные настройки? Несохранённые изменения будут потеряны."))window.location.reload();}}>Загрузить актуальные данные</button>}{saved&&<span role="status" className="object-settings-success">{saved}</span>}</div>
  </div></div>;
}

function toInputDate(value:string|null){if(!value)return"";if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const match=value.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);if(!match||!match[3])return"";return `${match[3]}-${match[2]}-${match[1]}`;}