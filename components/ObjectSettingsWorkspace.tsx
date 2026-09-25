"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ObjectRow } from "@/lib/data/service";
import type { ObjectManagementOptions } from "@/lib/operations/object-management";
import { Section } from "@/components/UI";

const statusOptions=[
  ["prelaunch","Подготовка"],["launch","Запуск"],["active","Активен"],["paused","Приостановлен"],["completed","Завершён"],["archived","Архив"],
] as const;

export function ObjectSettingsWorkspace({object,options,demo,canAssign}:{object:ObjectRow;options:ObjectManagementOptions;demo:boolean;canAssign:boolean}){
  const router=useRouter();
  const [name,setName]=useState(object.name);
  const [legalEntityId,setLegalEntityId]=useState(object.legalEntityId??options.legalEntities.find(item=>item.primary)?.id??"");
  const [address,setAddress]=useState(object.address??"");
  const [targetStartDate,setTargetStartDate]=useState(toInputDate(object.targetStart??null));
  const [status,setStatus]=useState(object.status);
  const [ownerUserId,setOwnerUserId]=useState(object.ownerUserId??"");
  const [additionalManagers,setAdditionalManagers]=useState<string[]>(()=>{const allowed=new Set(options.managers.map(item=>item.id));return (object.additionalManagers??[]).map(item=>item.userId).filter(id=>allowed.has(id));});
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
  const [saved,setSaved]=useState("");

  const previousOwner=object.ownerUserId&&ownerUserId!==object.ownerUserId?options.managers.find(item=>item.id===object.ownerUserId):null;
  const visibleAdditional=useMemo(()=>additionalManagers.filter(id=>id!==ownerUserId),[additionalManagers,ownerUserId]);

  function toggle(list:string[],set:(value:string[])=>void,id:string){set(list.includes(id)?list.filter(value=>value!==id):[...list,id]);}

  async function save(){
    try{
      setBusy(true);setError("");setSaved("");
      if(canAssign&&!ownerUserId)throw new Error("Выберите основного менеджера");
      if(canAssign&&!legalEntityId)throw new Error("Выберите юридическое лицо");
      if(canAssign&&recruitingMode==="object_team"&&!recruiters.length)throw new Error("Выберите команду подбора");
      if(demo){
        setSaved("Изменения применены локально для демо. После обновления страницы исходные данные восстановятся.");
        return;
      }
      if((scheduleWorkDays&&!scheduleRestDays)||(!scheduleWorkDays&&scheduleRestDays))throw new Error("Для графика укажите и рабочие, и выходные дни");
      const payload={
        name,address:address||null,targetStartDate:targetStartDate||null,status,
        defaultTransitionDays:Number(transitionDays||7),
        defaultDailyPaymentShifts:Number(dailyPaymentShifts||0),
        defaultScheduleWorkDays:scheduleWorkDays?Number(scheduleWorkDays):null,
        defaultScheduleRestDays:scheduleRestDays?Number(scheduleRestDays):null,
        defaultShiftKind,ppeTaskEnabled,ppeTaskDueDays:ppeTaskDueDays?Number(ppeTaskDueDays):null,
        ...(canAssign?{legalEntityId,ownerUserId,additionalManagerUserIds:visibleAdditional,recruitingMode,recruiterUserIds:recruitingMode==="object_team"?recruiters:[],keepPreviousManager:true}:{}),
      };
      const response=await fetch(`/api/objects/${object.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить настройки");
      setSaved("Настройки объекта сохранены");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить настройки");}
    finally{setBusy(false);}
  }

  return <div className="object-settings-layout">
    <Section title="Параметры объекта">
      <div className="object-settings-form">
        <label>Название объекта<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Наше юрлицо{canAssign?<select value={legalEntityId} onChange={e=>setLegalEntityId(e.target.value)}><option value="">Выберите юрлицо</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.shortName??item.name}</option>)}</select>:<input value={object.legalEntity??"Не указано"} disabled/>}</label>
        <label className="wide">Адрес<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Адрес объекта"/></label>
        <label>Плановая дата старта<input type="date" value={targetStartDate} onChange={e=>setTargetStartDate(e.target.value)}/></label>
        <label>Статус<select value={status} onChange={e=>setStatus(e.target.value)}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </Section>

    <Section title="Основание объекта">
      <div className="object-source-links">
        {object.sourceRequestId&&<Link href={`/requests/${object.sourceRequestId}`}>Исходная заявка <span>→</span></Link>}
        {object.sourceProposalId&&<Link href={`/proposals/${object.sourceProposalId}`}>Согласованное КП <span>→</span></Link>}
        {!object.sourceRequestId&&!object.sourceProposalId&&<div><strong>Добавлен вручную</strong></div>}
      </div>
    </Section>

    <Section title="Команда объекта">
      {canAssign?<div className="object-settings-form">
        <label>Основной менеджер<select value={ownerUserId} onChange={e=>{setOwnerUserId(e.target.value);setAdditionalManagers(current=>current.filter(id=>id!==e.target.value))}}><option value="">Выберите менеджера</option>{options.managers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="wide object-assignment-picker"><span>Дополнительные менеджеры</span><div>{options.managers.filter(item=>item.id!==ownerUserId).map(item=><label key={item.id}><input type="checkbox" checked={visibleAdditional.includes(item.id)} onChange={()=>toggle(visibleAdditional,setAdditionalManagers,item.id)}/><span>{item.name}</span></label>)}</div></div>
        {previousOwner&&<div className="wide object-handover-note"><strong>Передача объекта</strong><span>{previousOwner.name} останется дополнительным менеджером после назначения нового основного. Его можно снять отдельным сохранением после завершения передачи.</span></div>}
      </div>:<div className="object-settings-readonly"><div><span>Основной менеджер</span><strong>{object.ownerName??"Не назначен"}</strong></div><div><span>Дополнительные менеджеры</span><strong>{object.additionalManagers?.map(item=>item.name).join(", ")||"Нет"}</strong></div><small>Изменение команды доступно руководителю с правом назначения ответственных объекта.</small></div>}
    </Section>

    <Section title="Маршрутизация подбора">
      {canAssign?<div className="object-settings-form">
        <label className="wide">Новые потребности<select value={recruitingMode} onChange={e=>setRecruitingMode(e.target.value as "company_rules"|"object_team")}><option value="company_rules">По правилам компании</option><option value="object_team">Закреплённая команда объекта</option></select></label>
        {recruitingMode==="company_rules"
          ?<div className="wide object-routing-note">Новая потребность попадёт ответственному, определённому правилами компании. Руководитель подбора сможет распределить её между рекрутерами и задать каждому план.</div>
          :<div className="wide object-assignment-picker"><span>Закреплённая команда подбора</span><div>{options.recruiters.map(item=><label key={item.id}><input type="checkbox" checked={recruiters.includes(item.id)} onChange={()=>toggle(recruiters,setRecruiters,item.id)}/><span>{item.name}</span></label>)}</div><small>Все новые потребности объекта будут сразу доступны выбранным сотрудникам. Квоты автоматически не распределяются.</small></div>}
      </div>:<div className="object-settings-readonly"><div><span>Маршрут</span><strong>{object.recruitingMode==="object_team"?"Закреплённая команда объекта":"По правилам компании"}</strong></div>{object.recruitingMode==="object_team"&&<div><span>Команда подбора</span><strong>{object.recruitingTeam?.map(item=>item.name).join(", ")||"Не назначена"}</strong></div>}<small>Маршрутизация новых потребностей изменяется руководителем объекта или направления.</small></div>}
    </Section>

    <Section title="Работа с персоналом">
      <div className="object-settings-form">
        <label>Период адаптации, дней<input type="number" min="0" max="90" value={transitionDays} onChange={e=>setTransitionDays(e.target.value)}/><small>По умолчанию 7 дней после первого подтверждённого выхода.</small></label>
        <label>Ежедневная выплата, первых смен<input type="number" min="0" max="31" value={dailyPaymentShifts} onChange={e=>setDailyPaymentShifts(e.target.value)}/><small>0 — обычный график выплат. У сотрудника значение можно будет переопределить.</small></label>
        <label>Рабочих дней в цикле<input type="number" min="1" max="31" value={scheduleWorkDays} onChange={e=>setScheduleWorkDays(e.target.value)} placeholder="Например, 5"/></label>
        <label>Выходных дней в цикле<input type="number" min="0" max="31" value={scheduleRestDays} onChange={e=>setScheduleRestDays(e.target.value)} placeholder="Например, 2"/></label>
        <label>Смена по умолчанию<select value={defaultShiftKind} onChange={e=>setDefaultShiftKind(e.target.value as "day"|"night"|"mixed")}><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select></label>
        <label className="operations-check object-settings-check"><input type="checkbox" checked={ppeTaskEnabled} onChange={e=>setPpeTaskEnabled(e.target.checked)}/> Создавать напоминание по СИЗ после первого выхода</label>
        {ppeTaskEnabled&&<label>Срок напоминания по СИЗ, дней<input type="number" min="0" max="90" value={ppeTaskDueDays} onChange={e=>setPpeTaskDueDays(e.target.value)} placeholder="Без жёсткого срока"/><small>Можно оставить пустым: задача появится без обязательной даты.</small></label>}
        <div className="wide object-routing-note">Изменение этих значений влияет только на новых назначенных сотрудников. Уже начавшим работу сохраняются их собственные настройки.</div>
      </div>
    </Section>

    <div className="object-settings-actions"><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить настройки"}</button>{error&&<span className="form-error">{error}</span>}{saved&&<span className="object-settings-success">{saved}</span>}</div>
  </div>;
}

function toInputDate(value:string|null){if(!value)return"";if(/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return value;const match=value.match(/^(\\d{2})\\.(\\d{2})(?:\\.(\\d{4}))?$/);if(!match)return"";return `${match[3]??new Date().getFullYear()}-${match[2]}-${match[1]}`;}