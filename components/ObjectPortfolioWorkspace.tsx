"use client";

import Link from "next/link";
import {Plus} from "lucide-react";
import {Status} from "@/components/UI";
import {RegistryHeader} from "@/components/registry/RegistryHeader";
import {RegistryToolbar} from "@/components/registry/RegistryToolbar";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ObjectRow } from "@/lib/data/service";
import type { OperationsAnalyticsRow } from "@/lib/operations/service";
import type { ObjectManagementOptions } from "@/lib/operations/object-management";

const statusLabels:Record<string,string>={prelaunch:"Подготовка",launch:"Запуск",active:"Активен",paused:"Приостановлен",completed:"Завершён",archived:"Архив"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};
type CreateForm={name:string;code:string;clientId:string;legalEntityId:string;regionId:string;address:string;targetStartDate:string;actualStartDate:string;ownerUserId:string;additionalManagerUserIds:string[];recruitingMode:"company_rules"|"object_team";recruiterUserIds:string[];status:"prelaunch"|"active"};

function initialForm(options:ObjectManagementOptions):CreateForm{
  return {
    name:"",code:"",clientId:options.clients[0]?.id??"",legalEntityId:options.legalEntities.find(item=>item.primary)?.id??options.legalEntities[0]?.id??"",
    regionId:options.regions[0]?.id??"",address:"",targetStartDate:"",actualStartDate:todayIso(),ownerUserId:options.managers[0]?.id??"",additionalManagerUserIds:[],
    recruitingMode:"company_rules",recruiterUserIds:[],status:"active",
  };
}

export function ObjectPortfolioWorkspace({objects,analytics,options,canCreate,demo,summary}:{objects:ObjectRow[];analytics:OperationsAnalyticsRow[];options:ObjectManagementOptions;canCreate:boolean;demo:boolean;summary:ReactNode}){
  const router=useRouter();
  const [localRows,setLocalRows]=useState(objects);
  const analyticsByObject=useMemo(()=>new Map(analytics.map(row=>[row.objectId,row])),[analytics]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [region,setRegion]=useState("");
  const [manager,setManager]=useState("");
  const [legalEntity,setLegalEntity]=useState("");
  const [recruiter,setRecruiter]=useState("");
  const [attentionOnly,setAttentionOnly]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [form,setForm]=useState<CreateForm>(()=>initialForm(options));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const regions=useMemo(()=>[...new Set(localRows.map(row=>row.region).filter(Boolean))].sort(),[localRows]);
  const legalEntities=useMemo(()=>[...new Set(localRows.map(row=>row.legalEntity).filter((value):value is string=>Boolean(value)))].sort(),[localRows]);
  const managers=useMemo(()=>[...new Set(localRows.flatMap(row=>[row.ownerName,...(row.additionalManagers??[]).map(item=>item.name)]).filter((value):value is string=>Boolean(value)))].sort(),[localRows]);
  const recruiters=useMemo(()=>[...new Set(localRows.flatMap(row=>[...(row.activeRecruiters??[]),...(row.recruitingTeam??[])].map(item=>item.name)).filter(Boolean))].sort(),[localRows]);
  const filtered=useMemo(()=>localRows.filter(row=>{
    const recruiterNames=[...(row.activeRecruiters??[]),...(row.recruitingTeam??[])].map(item=>item.name);
    const managerNames=[row.ownerName,...(row.additionalManagers??[]).map(item=>item.name)].filter(Boolean);
    const hay=`${row.name} ${row.code} ${row.client} ${row.region} ${row.address??""} ${row.legalEntity??""} ${managerNames.join(" ")} ${recruiterNames.join(" ")}`.toLocaleLowerCase("ru");
    return (!query.trim()||hay.includes(query.trim().toLocaleLowerCase("ru")))
      &&(!status||row.status===status)
      &&(!region||row.region===region)
      &&(!legalEntity||row.legalEntity===legalEntity)
      &&(!manager||managerNames.includes(manager))
      &&(!recruiter||recruiterNames.includes(recruiter))
      &&(!attentionOnly||Boolean(row.attentionReasons?.length));
  }),[localRows,query,status,region,manager,legalEntity,recruiter,attentionOnly]);

  function reset(){setQuery("");setStatus("");setRegion("");setManager("");setLegalEntity("");setRecruiter("");setAttentionOnly(false);}
  function toggle(list:string[],key:keyof Pick<CreateForm,"additionalManagerUserIds"|"recruiterUserIds">,id:string){setForm(current=>({...current,[key]:list.includes(id)?list.filter(value=>value!==id):[...list,id]}));}

  async function createObject(){
    try{
      setBusy(true);setError("");
      if(!form.name.trim())throw new Error("Укажите название объекта");
      if(form.status==="active"&&!form.actualStartDate)throw new Error("Укажите фактическую дату начала работы");
      if(!form.clientId||!form.legalEntityId||!form.regionId||!form.ownerUserId)throw new Error("Заполните клиента, юрлицо, регион и основного менеджера");
      if(form.recruitingMode==="object_team"&&!form.recruiterUserIds.length)throw new Error("Выберите закреплённую команду подбора");
      if(demo){
        const client=options.clients.find(item=>item.id===form.clientId);
        const entity=options.legalEntities.find(item=>item.id===form.legalEntityId);
        const regionOption=options.regions.find(item=>item.id===form.regionId);
        const owner=options.managers.find(item=>item.id===form.ownerUserId);
        const additional=options.managers.filter(item=>form.additionalManagerUserIds.includes(item.id)).map(item=>({userId:item.id,name:item.name}));
        const fixedRecruiters=options.recruiters.filter(item=>form.recruiterUserIds.includes(item.id)).map(item=>({userId:item.id,name:item.name}));
        const id=crypto.randomUUID();
        setLocalRows(current=>[{
          id,objectId:id,organizationId:"demo",name:form.name.trim(),code:form.code.trim()||`OBJ-${String(current.length+1).padStart(3,"0")}`,
          client:client?.name??"Клиент",clientId:form.clientId,status:form.status,region:regionOption?.name??"Регион",regionId:form.regionId,address:form.address||null,
          legalEntityId:form.legalEntityId,legalEntity:entity?.shortName??entity?.name??null,targetStart:form.targetStartDate?formatShortDate(form.targetStartDate):null,targetStartDate:form.targetStartDate||null,
          actualStartDate:form.status==="active"?form.actualStartDate:null,actualEndDate:null,
          ownerUserId:form.ownerUserId,ownerName:owner?.name??null,additionalManagers:additional,recruitingMode:form.recruitingMode,recruitingTeam:fixedRecruiters,
          activeRecruiters:[],unassignedNeedCount:0,assigneeUserIds:[form.ownerUserId,...form.additionalManagerUserIds,...form.recruiterUserIds],
          coverage:0,required:0,filled:0,deficit:0,risk:"normal",riskReasons:[],attentionReasons:["План численности не задан"],
        },...current]);
        setCreateOpen(false);setForm(initialForm(options));return;
      }
      const response=await fetch("/api/objects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,code:form.code||null,address:form.address||null,targetStartDate:form.targetStartDate||null,actualStartDate:form.status==="active"?form.actualStartDate:null})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось создать объект");
      setCreateOpen(false);router.push(`/objects/${json.id}`);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать объект");}
    finally{setBusy(false);}
  }

  return <>
    <RegistryHeader title="Объекты" subtitle="Портфель объектов: юридические лица, ответственные, комплектация и операционные сигналы." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Объекты"}]} actions={canCreate&&<button className="button primary" onClick={()=>{setError("");setCreateOpen(true)}}><Plus size={15}/> Добавить объект</button>}/>
    {summary}
    <RegistryToolbar query={query} onQueryChange={setQuery} searchLabel="Поиск объектов" placeholder="Объект, клиент, адрес, ответственный"
      quickFilter={{label:"Статус",value:status,emptyValue:"",onChange:setStatus,options:[{value:"",label:"Все статусы"},...Object.entries(statusLabels).map(([value,label])=>({value,label}))]}}
      filters={[
        {label:"Регион",value:region,emptyValue:"",onChange:setRegion,searchable:true,options:[{value:"",label:"Все регионы"},...regions.map(value=>({value,label:value}))]},
        {label:"Юрлицо",value:legalEntity,emptyValue:"",onChange:setLegalEntity,searchable:true,options:[{value:"",label:"Все юрлица"},...legalEntities.map(value=>({value,label:value}))]},
        {label:"Менеджер",value:manager,emptyValue:"",onChange:setManager,searchable:true,options:[{value:"",label:"Все менеджеры"},...managers.map(value=>({value,label:value}))]},
        {label:"Рекрутер",value:recruiter,emptyValue:"",onChange:setRecruiter,searchable:true,options:[{value:"",label:"Все рекрутеры"},...recruiters.map(value=>({value,label:value}))]},
      ]} onReset={reset}/>

    <div className="object-portfolio-results">
      <span>Показано {filtered.length} из {localRows.length}</span>
      <div className="object-portfolio-result-actions">
        <label className={"object-attention-filter"+(attentionOnly?" active":"")}><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/>Только требующие внимания</label>
        {attentionOnly&&!query&&!status&&!region&&!manager&&!legalEntity&&!recruiter&&<button className="object-filter-reset" onClick={reset}>Сбросить фильтры</button>}
      </div>
    </div>
    <section className="section section-flush">
      <div className="request-table-wrap"><table className="data-table object-portfolio-table">
        <thead><tr><th>Объект</th><th>Клиент</th><th>Наше юрлицо</th><th>Локация</th><th>Менеджер объекта</th><th>Подбор</th><th>Статус</th><th>Комплектация</th><th>Период</th><th>Внимание</th></tr></thead>
        <tbody>{filtered.map(row=>{
          const fact=analyticsByObject.get(row.id);
          const working=fact?.working??row.filled;
          const required=fact?.required??row.required;
          const deficit=Math.max(required-working,0);
          const coverage=required?Math.min(100,Math.round(working/required*100)):null;
          return <tr key={row.id}>
            <td><Link className="cell-title" href={"/objects/"+row.id}>{row.name}</Link><span className="cell-sub">{row.code}</span></td>
            <td>{row.client}</td>
            <td><span className={row.legalEntity?"":"cell-sub"}>{row.legalEntity??"Не указано"}</span></td>
            <td><span className="object-location">{row.address??row.region}</span>{row.address&&row.address!==row.region&&<span className="cell-sub">{row.region}</span>}</td>
            <td><PeopleCell primary={row.ownerName??fact?.manager??null} additional={row.additionalManagers??[]} empty="Не назначен"/></td>
            <td><RecruitingCell row={row}/></td>
            <td><ObjectStatus status={row.status}/></td>
            <td><div className={"object-staffing-cell"+(required?"":" is-empty")}>{required?<><div><strong>{working} из {required}</strong><span>{coverage}%</span></div><div className="progress"><span style={{width:coverage+"%"}}/></div><small className={deficit?"object-staffing-deficit":""}>{deficit?`Нужно ещё ${deficit}`:"План закрыт"}</small></>:<><strong>План не задан</strong><small>Укажите потребность объекта</small></>}</div></td>
            <td><PeriodCell row={row}/></td>
            <td><AttentionCell row={row}/></td>
          </tr>
        })}</tbody>
      </table>{!filtered.length&&<div className="empty-inline">По выбранным фильтрам объектов нет</div>}</div>
    </section>

    {createOpen&&<><div className="drawer-backdrop" onClick={()=>setCreateOpen(false)}/><aside className="drawer object-create-drawer"><button className="icon-button drawer-close" onClick={()=>setCreateOpen(false)}>×</button><span className="eyebrow">Операции</span><h2>Добавить объект</h2><p className="form-hint">Для уже действующего объекта или запуска вне коммерческой цепочки. Объекты из согласованного КП по-прежнему создаются через «Начать подготовку».</p>
      <div className="object-create-form">
        <label className="wide">Название объекта<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Например, РЦ Северный"/></label>
        <label>Клиент<select value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})}><option value="">Выберите клиента</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Наше юрлицо<select value={form.legalEntityId} onChange={e=>setForm({...form,legalEntityId:e.target.value})}><option value="">Выберите юрлицо</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.shortName??item.name}</option>)}</select></label>
        <label>Регион<select value={form.regionId} onChange={e=>setForm({...form,regionId:e.target.value})}><option value="">Выберите регион</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Основной менеджер<select value={form.ownerUserId} onChange={e=>setForm({...form,ownerUserId:e.target.value,additionalManagerUserIds:form.additionalManagerUserIds.filter(id=>id!==e.target.value)})}><option value="">Выберите менеджера</option>{options.managers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="wide">Адрес<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
        {form.status==="active"?<label>Фактическая дата начала<input type="date" value={form.actualStartDate} onChange={e=>setForm({...form,actualStartDate:e.target.value})}/></label>:<label>Плановая дата запуска<input type="date" value={form.targetStartDate} onChange={e=>setForm({...form,targetStartDate:e.target.value})}/></label>}
        <label>Состояние<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as CreateForm["status"],actualStartDate:e.target.value==="active"?(form.actualStartDate||todayIso()):form.actualStartDate})}><option value="active">Уже действует</option><option value="prelaunch">Подготовка к запуску</option></select></label>
        <label>Код объекта<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Автоматически"/></label>
        <div className="wide object-assignment-picker"><span>Дополнительные менеджеры</span><div>{options.managers.filter(item=>item.id!==form.ownerUserId).map(item=><label key={item.id}><input type="checkbox" checked={form.additionalManagerUserIds.includes(item.id)} onChange={()=>toggle(form.additionalManagerUserIds,"additionalManagerUserIds",item.id)}/><span>{item.name}</span></label>)}</div></div>
        <label className="wide">Маршрутизация подбора<select value={form.recruitingMode} onChange={e=>setForm({...form,recruitingMode:e.target.value as CreateForm["recruitingMode"]})}><option value="company_rules">По правилам компании</option><option value="object_team">Закреплённая команда объекта</option></select></label>
        {form.recruitingMode==="object_team"&&<div className="wide object-assignment-picker"><span>Команда подбора</span><div>{options.recruiters.map(item=><label key={item.id}><input type="checkbox" checked={form.recruiterUserIds.includes(item.id)} onChange={()=>toggle(form.recruiterUserIds,"recruiterUserIds",item.id)}/><span>{item.name}</span></label>)}</div><small>Новые потребности будут доступны всем выбранным сотрудникам; план по людям распределяется уже внутри потребности.</small></div>}
      </div>
      {error&&<div className="form-error">{error}</div>}
      <div className="drawer-actions"><button className="button" onClick={()=>setCreateOpen(false)}>Отмена</button><button className="button primary" disabled={busy||!options.legalEntities.length} onClick={()=>void createObject()}>{busy?"Создаю…":"Создать объект"}</button></div>
    </aside></>}
  </>;
}

function PeopleCell({primary,additional,empty}:{primary:string|null;additional:Array<{userId:string;name:string}>;empty:string}){
  if(!primary)return <span className="cell-sub">{empty}</span>;
  return <div className="object-people-cell" title={[primary,...additional.map(item=>item.name)].join(", ")}><strong>{primary}</strong>{additional.length>0&&<span>+{additional.length}</span>}</div>;
}

function RecruitingCell({row}:{row:ObjectRow}){
  const active=row.activeRecruiters??[];
  const fixed=row.recruitingTeam??[];
  if(row.recruitingMode==="object_team"&&fixed.length)return <div className="object-recruiting-cell" title={fixed.map(item=>item.name).join(", ")}><div><strong>{fixed[0].name}</strong>{fixed.length>1&&<span>+{fixed.length-1}</span>}</div><small>Закреплённая команда</small>{row.unassignedNeedCount? <em>{row.unassignedNeedCount} без распределения</em>:null}</div>;
  if(active.length)return <div className="object-recruiting-cell" title={active.map(item=>item.name).join(", ")}><div><strong>{active[0].name}</strong>{active.length>1&&<span>+{active.length-1}</span>}</div><small>По активным потребностям</small>{row.unassignedNeedCount? <em>{row.unassignedNeedCount} без ответственного</em>:null}</div>;
  if(row.unassignedNeedCount)return <div className="object-recruiting-cell"><strong className="object-recruiting-alert">Не распределено</strong><small>{row.unassignedNeedCount} потребн.</small></div>;
  return <div className="object-recruiting-cell"><strong>По правилам компании</strong><small>Новые потребности маршрутизируются автоматически</small></div>;
}

function PeriodCell({row}:{row:ObjectRow}){
  const target=row.targetStartDate??null;
  const actual=row.actualStartDate??null;
  const ended=row.actualEndDate??null;
  if(row.status==="prelaunch"||row.status==="launch"){
    if(!target)return <div className="object-period-cell is-empty"><strong>Дата не указана</strong><small>план запуска</small></div>;
    return <div className="object-period-cell"><strong>{formatShortDate(target)}</strong><small>{relativeDateLabel(target)}</small></div>;
  }
  if(actual){
    const end=(row.status==="completed"||row.status==="archived")?ended:todayIso();
    const secondary=(row.status==="completed"||row.status==="archived")
      ?ended?`${formatShortDate(actual)} – ${formatShortDate(ended)}`:`с ${formatShortDate(actual)} · нет даты завершения`
      :`с ${formatShortDate(actual)}`;
    return <div className="object-period-cell"><strong>{end?durationLabel(actual,end):"Период"}</strong><small>{secondary}</small></div>;
  }
  return <div className="object-period-cell is-empty"><strong>Не указан</strong><small>дата начала работы</small></div>;
}

function todayIso(){return new Date().toISOString().slice(0,10)}

function parseIso(value:string){
  const [year,month,day]=value.split("-").map(Number);
  return new Date(Date.UTC(year,month-1,day));
}

function formatShortDate(value:string){
  const date=parseIso(value);
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(date);
}

function relativeDateLabel(value:string){
  const day=24*60*60*1000;
  const diff=Math.round((parseIso(value).getTime()-parseIso(todayIso()).getTime())/day);
  if(diff===0)return "сегодня";
  return diff>0?`через ${diff} дн.`:`${Math.abs(diff)} дн. назад`;
}

function durationLabel(from:string,to:string){
  const start=parseIso(from);const end=parseIso(to);
  if(end<start)return "—";
  let months=(end.getUTCFullYear()-start.getUTCFullYear())*12+(end.getUTCMonth()-start.getUTCMonth());
  if(end.getUTCDate()<start.getUTCDate())months-=1;
  if(months>=12){
    const years=Math.floor(months/12);const rest=months%12;
    return rest?`${years} г. ${rest} мес.`:`${years} г.`;
  }
  if(months>=1)return `${months} мес.`;
  const days=Math.max(0,Math.floor((end.getTime()-start.getTime())/(24*60*60*1000)));
  return `${days} дн.`;
}

function ObjectStatus({status}:{status:string}){
  return <Status tone={status==="active"?"good":status==="paused"?"warn":"neutral"}>{statusLabels[status]??"В работе"}</Status>;
}

function AttentionCell({row}:{row:ObjectRow}){
  const signals=row.attentionReasons??[];
  const reasons=row.riskReasons??[];
  if(!signals.length&&!reasons.length)return <span className="object-attention-clear">Нет сигналов</span>;

  const primary=signals[0]??reasons[0]?.label??"Требует внимания";
  const extra=Math.max(signals.length-1,0);
  const level=riskLabels[row.risk??"normal"]??"Контроль";
  const title=[...signals,...reasons.map(reason=>`${reason.label}: ${reason.detail}`)].join("; ");

  return <div className="object-risk-cell">
    <button type="button" className="object-attention-trigger" aria-label={`Требует внимания: ${title}`}>
      <span>{primary}</span>{extra>0&&<b>+{extra}</b>}
    </button>
    <div className="object-risk-popover" role="tooltip">
      <strong>Что требует внимания</strong>
      {signals.length?<ul>{signals.map((signal,index)=><li key={signal+index}><span>{signal}</span></li>)}</ul>:null}
      {reasons.length?<small>Уровень операционного контроля: {level.toLocaleLowerCase("ru")}.</small>:null}
    </div>
  </div>;
}
