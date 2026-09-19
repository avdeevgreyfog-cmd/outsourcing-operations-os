"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

type Grant={
  capability:string;
  description:string;
  domain:string;
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

const scopeOptions=[
  {value:"assigned_to_me",label:"Назначенные мне"},
  {value:"org_unit_subtree",label:"Подразделение и вложенные"},
  {value:"org_unit",label:"Моё подразделение"},
  {value:"region",label:"Мой регион"},
  {value:"team",label:"Моя команда"},
  {value:"self",label:"Только свои данные"},
  {value:"own_created",label:"Созданные мной"},
  {value:"all_org",label:"Вся организация"},
];

export function CapabilityEditor({targetType,targetId,canManage}:{targetType:"position"|"process_role";targetId:string;canManage:boolean}){
  const [items,setItems]=useState<Grant[]|null>(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState("");

  useEffect(()=>{
    let active=true;
    setItems(null);
    setError("");
    fetch(`/api/organization/grants?targetType=${targetType}&targetId=${targetId}`)
      .then(async response=>{
        const body=await response.json();
        if(!response.ok)throw new Error(body.error);
        if(active)setItems(body.items);
      })
      .catch(value=>active&&setError(value.message));
    return()=>{active=false};
  },[targetId,targetType]);

  async function update(item:Grant,effect:Grant["effect"],scopeType?:string){
    setSaving(item.capability);
    setError("");
    const nextScope=effect==="allow"?(scopeType??item.scopeType??"assigned_to_me"):item.scopeType;
    const response=await fetch("/api/organization/grants",{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        targetType,
        targetId,
        capability:item.capability,
        effect,
        scopeType:nextScope,
        scopeIds:item.scopeIds,
      }),
    });
    const body=await response.json();
    setSaving("");
    if(!response.ok){
      setError(body.error);
      return;
    }
    setItems(value=>value?.map(entry=>entry.capability===item.capability
      ?{...entry,effect,scopeType:effect==="allow"?nextScope:entry.scopeType}
      :entry
    )??null);
  }

  if(error)return <p className="form-message">{error}</p>;
  if(items===null)return <p>Загрузка набора доступов…</p>;
  if(!items.length)return <p>Доступные права не найдены.</p>;

  return <div className="capability-editor">
    {items.map(item=>{
      const scopeValue=item.scopeType??"assigned_to_me";
      return <div key={item.capability}>
        <ShieldCheck size={14}/>
        <span>
          <strong>{item.description||item.capability}</strong>
          <small>{domainLabels[item.domain]??item.domain} · {item.capability}</small>
        </span>
        <select
          aria-label={`Правило ${item.capability}`}
          value={item.effect}
          disabled={!canManage||saving===item.capability}
          onChange={event=>update(item,event.target.value as Grant["effect"])}
        >
          <option value="inherit">Наследовать</option>
          <option value="allow">Разрешить</option>
          <option value="deny">Запретить</option>
        </select>
        <select
          className="capability-scope"
          aria-label={`Область ${item.capability}`}
          value={scopeValue}
          disabled={!canManage||saving===item.capability||item.effect!=="allow"}
          onChange={event=>update(item,"allow",event.target.value)}
        >
          {scopeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>;
    })}
  </div>;
}
