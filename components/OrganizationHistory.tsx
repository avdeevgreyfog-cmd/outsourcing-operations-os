"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

type Event={id:string;action:string;actor:string|null;before:Record<string,unknown>|null;after:Record<string,unknown>|null;reason:string|null;createdAt:string};
const actionLabels:Record<string,string>={INSERT:"Создано",UPDATE:"Изменено",DELETE:"Удалено",insert:"Создано",update:"Изменено",delete:"Удалено"};
const ignored=new Set(["updated_at","created_at","organization_id"]);

export function OrganizationHistory({type,id}:{type:string;id:string}){
  const [items,setItems]=useState<Event[]|null>(null);const [error,setError]=useState("");
  useEffect(()=>{let active=true;fetch(`/api/organization/history?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);if(active)setItems(body.items)}).catch(value=>active&&setError(value.message??"Не удалось загрузить историю"));return()=>{active=false}},[type,id]);
  if(error)return <div className="history-state bad"><strong>История недоступна</strong><span>{error}</span></div>;
  if(items===null)return <div className="history-state"><span className="spinner"/>Загрузка истории…</div>;
  if(!items.length)return <div className="history-state"><Clock3 size={17}/><strong>Изменений пока нет</strong><span>Новые операции появятся здесь с автором и датой.</span></div>;
  return <ol className="organization-history">{items.map(item=>{const changed=changedKeys(item.before,item.after);return <li key={item.id}><span className="history-mark"><Clock3 size={13}/></span><div><strong>{actionLabels[item.action]??item.action}</strong><small>{item.actor??"Системная операция"} · {new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.createdAt))}</small>{changed.length>0&&<p>Поля: {changed.join(", ")}</p>}{item.reason&&<p>{item.reason}</p>}</div></li>})}</ol>;
}

function changedKeys(before:Record<string,unknown>|null,after:Record<string,unknown>|null){const keys=new Set([...Object.keys(before??{}),...Object.keys(after??{})]);return [...keys].filter(key=>!ignored.has(key)&&JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])).slice(0,8).map(key=>key.replaceAll("_"," "));}
