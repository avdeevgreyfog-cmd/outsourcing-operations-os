"use client";
import { useEffect, useMemo, useState } from "react";
import { Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { Status } from "@/components/UI";
import type { AccessUserRow } from "@/lib/data/service";
import { SYSTEM_ADMIN_CAPABILITIES } from "@/lib/access/system";

type AccessRule={
  capability:string;
  description:string|null;
  domain:string;
  resource:string;
  action:string;
  fieldSensitive:boolean;
  effect:"inherit"|"allow"|"deny";
  scopeType:string|null;
  scopeIds:string[];
};

const domainLabels:Record<string,string>={
  home:"Главная",
  control:"Задачи и контроль",
  sales:"Коммерция",
  calculation:"Экономика",
  operations:"Операции",
  recruiting:"Подбор",
  worker:"Сотрудники",
  time:"Табели",
  finance:"Финансы",
  analytics:"Аналитика",
  organization:"Организация",
  admin:"Администрирование",
};

const scopes=[
  {value:"assigned_to_me",label:"Назначенные мне"},
  {value:"org_unit_subtree",label:"Подразделение и вложенные"},
  {value:"org_unit",label:"Моё подразделение"},
  {value:"region",label:"Мой регион"},
  {value:"team",label:"Моя команда"},
  {value:"self",label:"Только свои данные"},
  {value:"own_created",label:"Созданные сотрудником"},
  {value:"all_org",label:"Вся организация"},
];

const demoRules:AccessRule[]=[
  {capability:"sales.request.read",description:"Просмотр заявок",domain:"sales",resource:"request",action:"read",fieldSensitive:false,effect:"inherit",scopeType:null,scopeIds:[]},
  {capability:"operations.object.read",description:"Просмотр объектов",domain:"operations",resource:"object",action:"read",fieldSensitive:false,effect:"inherit",scopeType:null,scopeIds:[]},
  {capability:"operations.need.read",description:"Просмотр потребностей",domain:"operations",resource:"need",action:"read",fieldSensitive:false,effect:"inherit",scopeType:null,scopeIds:[]},
  {capability:"recruiting.candidate.read",description:"Просмотр кандидатов",domain:"recruiting",resource:"candidate",action:"read",fieldSensitive:false,effect:"inherit",scopeType:null,scopeIds:[]},
  {capability:"worker.read",description:"Просмотр сотрудников",domain:"worker",resource:"profile",action:"read",fieldSensitive:false,effect:"inherit",scopeType:null,scopeIds:[]},
  {capability:"finance.pnl.read",description:"Просмотр прибылей и убытков",domain:"finance",resource:"pnl",action:"read",fieldSensitive:true,effect:"inherit",scopeType:null,scopeIds:[]},
];

export function AccessEditor({
  users,
  demo,
  canManageSystemAccess,
  currentIsOwner,
}:{users:AccessUserRow[];demo:boolean;canManageSystemAccess:boolean;currentIsOwner:boolean}){
  const [selectedId,setSelectedId]=useState(users[0]?.membershipId??"");
  const user=users.find(item=>item.membershipId===selectedId);
  const [rules,setRules]=useState<AccessRule[]|null>(demo?demoRules:null);
  const [capability,setCapability]=useState(demoRules[0].capability);
  const [effect,setEffect]=useState<"inherit"|"allow"|"deny">("inherit");
  const [scope,setScope]=useState("assigned_to_me");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [systemBusy,setSystemBusy]=useState("");
  const [systemAccess,setSystemAccess]=useState<Record<string,string[]>>(
    Object.fromEntries(users.map(item=>[item.membershipId,[...item.systemCapabilities]])),
  );

  async function loadRules(membershipId:string){
    if(demo){
      setRules(demoRules);
      return;
    }
    setRules(null);
    setMessage("");
    const response=await fetch(`/api/admin/access?membershipId=${membershipId}`);
    const body=await response.json();
    if(!response.ok){
      setRules([]);
      setMessage(body.error??"Не удалось загрузить права");
      return;
    }
    setRules(body.items);
    if(body.items.length&&!body.items.some((item:AccessRule)=>item.capability===capability)){
      setCapability(body.items[0].capability);
    }
  }

  useEffect(()=>{
    if(selectedId)void loadRules(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedId,demo]);

  const selectedRule=rules?.find(item=>item.capability===capability);
  useEffect(()=>{
    if(!selectedRule)return;
    setEffect(selectedRule.effect);
    setScope(selectedRule.scopeType??"assigned_to_me");
  },[selectedRule]);

  const groupedRules=useMemo(()=>{
    const map=new Map<string,AccessRule[]>();
    for(const item of rules??[]){
      const list=map.get(item.domain)??[];
      list.push(item);
      map.set(item.domain,list);
    }
    return [...map.entries()];
  },[rules]);

  async function save(){
    if(demo){
      setMessage("В демонстрационном режиме изменения не сохраняются.");
      return;
    }
    if(!user||!selectedRule)return;
    setBusy(true);
    setMessage("");
    const response=await fetch("/api/admin/access",{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        membershipId:selectedId,
        capability,
        effect,
        scopeType:effect==="allow"?scope:undefined,
      }),
    });
    const body=await response.json();
    setBusy(false);
    setMessage(response.ok?"Изменение сохранено. Новые права применятся со следующего запроса.":body.error??"Не удалось сохранить");
    if(response.ok)void loadRules(selectedId);
  }

  async function toggleSystem(systemCapability:string,enabled:boolean){
    if(demo){
      setMessage("В демонстрационном режиме изменения не сохраняются.");
      return;
    }
    if(!user||!canManageSystemAccess)return;
    setSystemBusy(systemCapability);
    setMessage("");
    const response=await fetch("/api/admin/system-access",{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        membershipId:selectedId,
        capability:systemCapability,
        enabled,
        reason:"Изменено в разделе «Пользователи и права»",
      }),
    });
    const body=await response.json();
    setSystemBusy("");
    if(!response.ok){
      setMessage(body.error??"Не удалось изменить системные полномочия");
      return;
    }
    setSystemAccess(value=>{
      const current=new Set(value[selectedId]??[]);
      if(enabled)current.add(systemCapability);else current.delete(systemCapability);
      return {...value,[selectedId]:[...current]};
    });
    setMessage("Системные полномочия обновлены.");
  }

  const activeSystem=new Set(systemAccess[selectedId]??[]);

  return <div className="access-editor">
    <aside className="access-users">
      {users.map(item=><button
        type="button"
        key={item.membershipId}
        className={item.membershipId===selectedId?"active":""}
        onClick={()=>setSelectedId(item.membershipId)}
      >
        <span className="avatar">{item.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</span>
        <span>
          <strong>{item.name}</strong>
          <small>{item.role} · {item.isOwner?"владелец":item.systemCapabilities.length?"системных прав: "+item.systemCapabilities.length:"доп. ролей: "+item.processRoles.length}</small>
        </span>
      </button>)}
    </aside>

    <div className="access-workspace">
      <div className="access-person">
        <div>
          <h2>{user?.name??"Пользователь не выбран"}</h2>
          <p>{user?.email} · должность {user?.role}{user?.processRoles.length?" · роли: "+user.processRoles.join(", "):""}</p>
        </div>
        <Status tone={user?.isOwner?"info":demo?"warn":"good"}>{user?.isOwner?"Владелец":demo?"Предпросмотр":"Активен"}</Status>
      </div>

      <section className="system-access-block">
        <header>
          <div>
            <h3>Системные полномочия</h3>
            <p>Отдельны от должности. Используются для администрирования организации и не открывают бизнес-данные сами по себе.</p>
          </div>
          <ShieldCheck size={18}/>
        </header>
        <div className="system-access-list">
          {SYSTEM_ADMIN_CAPABILITIES.map(item=>{
            const checked=user?.isOwner||activeSystem.has(item.capability);
            const disabled=demo||!canManageSystemAccess||Boolean(user?.isOwner)||systemBusy===item.capability||Boolean(item.ownerOnly&&!currentIsOwner);
            return <label className="system-access-item" key={item.capability}>
              <input
                type="checkbox"
                checked={Boolean(checked)}
                disabled={disabled}
                onChange={event=>toggleSystem(item.capability,event.target.checked)}
              />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}{item.ownerOnly?" Только владелец может делегировать это право.":""}</small>
              </span>
            </label>;
          })}
        </div>
      </section>

      <section className="individual-access-block">
        <div className="access-section-heading">
          <h3>Индивидуальное исключение</h3>
          <p>Используйте только когда доступ конкретного сотрудника должен отличаться от его должности и процессных ролей.</p>
        </div>
        <div className="access-form">
          <label>Разрешение
            <select value={capability} onChange={event=>setCapability(event.target.value)} disabled={!rules?.length}>
              {groupedRules.map(([domain,items])=><optgroup key={domain} label={domainLabels[domain]??domain}>
                {items.map(item=><option key={item.capability} value={item.capability}>{item.description||item.capability}</option>)}
              </optgroup>)}
            </select>
          </label>
          <label>Правило
            <select value={effect} onChange={event=>setEffect(event.target.value as typeof effect)} disabled={!selectedRule}>
              <option value="inherit">Наследовать должность и роли</option>
              <option value="allow">Разрешить дополнительно</option>
              <option value="deny">Запретить индивидуально</option>
            </select>
          </label>
          {effect==="allow"&&<label>Область данных
            <select value={scope} onChange={event=>setScope(event.target.value)}>
              {scopes.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>}
          <div className="access-warning">
            <ShieldAlert size={16}/>
            <span>Рабочий доступ должен в основном приходить из должности. Индивидуальное правило применяется только к выбранному сотруднику; системное администрирование настраивается выше.</span>
          </div>
          <button className="button primary" type="button" disabled={busy||!user||!selectedRule} onClick={save}>
            <Save size={14}/>{busy?"Сохранение…":"Сохранить исключение"}
          </button>
          {rules===null&&<p className="form-message">Загрузка каталога прав…</p>}
          {message&&<p className="form-message">{message}</p>}
        </div>
      </section>
    </div>
  </div>;
}
