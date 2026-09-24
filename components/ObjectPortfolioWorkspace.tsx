"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ObjectRow } from "@/lib/data/service";
import type { OperationsAnalyticsRow } from "@/lib/operations/service";
import type { ObjectManagementOptions } from "@/lib/operations/object-management";
import { Status } from "@/components/UI";

const statusLabels:Record<string,string>={prelaunch:"Подготовка",launch:"Запуск",active:"Активен",paused:"Приостановлен",completed:"Завершён",archived:"Архив"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};
type CreateForm={name:string;code:string;clientId:string;legalEntityId:string;regionId:string;address:string;targetStartDate:string;ownerUserId:string;additionalManagerUserIds:string[];recruitingMode:"company_rules"|"object_team";recruiterUserIds:string[];status:"prelaunch"|"active"};

function initialForm(options:ObjectManagementOptions):CreateForm{
  return {
    name:"",code:"",clientId:options.clients[0]?.id??"",legalEntityId:options.legalEntities.find(item=>item.primary)?.id??options.legalEntities[0]?.id??"",
    regionId:options.regions[0]?.id??"",address:"",targetStartDate:"",ownerUserId:options.managers[0]?.id??"",additionalManagerUserIds:[],
    recruitingMode:"company_rules",recruiterUserIds:[],status:"active",
  };
}

export function ObjectPortfolioWorkspace({objects,analytics,options,canCreate,demo}:{objects:ObjectRow[];analytics:OperationsAnalyticsRow[];options:ObjectManagementOptions;canCreate:boolean;demo:boolean}){
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
  const hasFilters=Boolean(query||status||region||manager||legalEntity||recruiter||attentionOnly);
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
          legalEntityId:form.legalEntityId,legalEntity:entity?.shortName??entity?.name??null,targetStart:form.targetStartDate||null,
          ownerUserId:form.ownerUserId,ownerName:owner?.name??null,additionalManagers:additional,recruitingMode:form.recruitingMode,recruitingTeam:fixedRecruiters,
          activeRecruiters:[],unassignedNeedCount:0,assigneeUserIds:[form.ownerUserId,...form.additionalManagerUserIds,...form.recruiterUserIds],
          coverage:0,required:0,filled:0,deficit:0,risk:"normal",riskReasons:[],attentionReasons:["План численности не задан"],
        },...current]);
        setCreateOpen(false);setForm(initialForm(options));return;
      }
      const response=await fetch("/api/objects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,code:form.code||null,address:form.address||null,targetStartDate:form.targetStartDate||null})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось создать объект");
      setCreateOpen(false);router.push(`/objects/${json.id}`);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать объект");}
    finally{setBusy(false);}
  }

  return <>
    <div className="object-portfolio-toolbar-row">
      <div className="object-portfolio-toolbar">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по объекту, клиенту, локации, юрлицу или ответственному"/>
        <select value={region} onChange={e=>setRegion(e.target.value)}><option value="">Все регионы</option>{regions.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select value={legalEntity} onChange={e=>setLegalEntity(e.target.value)}><option value="">Все юрлица</option>{legalEntities.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select value={manager} onChange={e=>setManager(e.target.value)}><option value="">Все менеджеры</option>{managers.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select value={recruiter} onChange={e=>setRecruiter(e.target.value)}><option value="">Весь подбор</option>{recruiters.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <label className={"object-attention-filter"+(attentionOnly?" active":"")}><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/>Требует внимания</label>
        {hasFilters&&<button className="button" onClick={reset}>Сбросить</button>}
      </div>
      {canCreate&&<button className="button primary object-create-button" onClick={()=>{setError("");setCreateOpen(true)}}>+ Добавить объект</button>}
    </div>

    <div className="object-portfolio-results"><span>Показано {filtered.length} из {localRows.length}</span>{attentionOnly&&<span>Только объекты с рабочими сигналами</span>}</div>
    <section className="section section-flush">
      <div className="request-table-wrap"><table className="data-table object-portfolio-table">
        <thead><tr><th>Объект</th><th>Клиент</th><th>Наше юрлицо</th><th>Локация</th><th>Менеджер объекта</th><th>Подбор</th><th>Статус</th><th>Комплектация</th><th>Старт</th><th>Риск</th></tr></thead>
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
            <td><Status tone={row.status==="active"?"good":row.status==="paused"?"warn":"info"}>{statusLabels[row.status]??"В работе"}</Status></td>
            <td><div className={"object-staffing-cell"+(required?"":" is-empty")}>{required?<><div><strong>{working} из {required}</strong><span>{coverage}%</span></div><div className="progress"><span style={{width:coverage+"%"}}/></div><small className={deficit?"priority-critical":""}>{deficit?`Найти ещё ${deficit}`:"План закрыт"}</small></>:<><strong>План не задан</strong><small>Укажите потребность объекта</small></>}</div></td>
            <td>{row.targetStart??"—"}</td>
            <td><RiskCell row={row}/></td>
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
        <label>Дата старта<input type="date" value={form.targetStartDate} onChange={e=>setForm({...form,targetStartDate:e.target.value})}/></label>
        <label>Состояние<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as CreateForm["status"]})}><option value="active">Уже действует</option><option value="prelaunch">Подготовка к запуску</option></select></label>
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
  if(row.unassignedNeedCount)return <div className="object-recruiting-cell"><strong className="priority-critical">Не распределено</strong><small>{row.unassignedNeedCount} потребн.</small></div>;
  return <div className="object-recruiting-cell"><strong>По правилам компании</strong><small>Новые потребности маршрутизируются автоматически</small></div>;
}

function RiskCell({row}:{row:ObjectRow}){
  const reasons=row.riskReasons??[];
  const label=riskLabels[row.risk??"normal"]??"Контроль";
  const title=reasons.length?`${label}: ${reasons.map(reason=>`${reason.label} — ${reason.detail}`).join("; ")}`:`${label}: операционных сигналов нет`;
  return <div className="object-risk-cell"><button type="button" className="object-risk-trigger" title={title} aria-label={`Риск: ${label}. Показать причины`}><Status tone={row.risk==="critical"?"bad":row.risk==="high"||row.risk==="watch"?"warn":"good"}>{label}</Status></button><div className="object-risk-popover" role="tooltip"><strong>{label} риск</strong>{reasons.length?<ul>{reasons.map(reason=><li key={reason.code}><b>{reason.label}</b><span>{reason.detail}</span></li>)}</ul>:<span>Операционных сигналов, повышающих риск, сейчас нет.</span>}{row.attentionReasons?.some(reason=>reason==="План численности не задан")&&<small>План численности не задан — это рабочий сигнал, но сам по себе он не повышает операционный риск.</small>}</div></div>;
}
