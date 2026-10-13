"use client";
import {useState} from "react";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
type Specialty={id:string;name:string};

export function CreateWorkerSpecialty({canManage,demo,onCreated}:{canManage:boolean;demo:boolean;onCreated:(row:Specialty)=>void}){
 const [open,setOpen]=useState(false),[name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(){setBusy(true);setError("");try{
  const response=await fetch("/api/admin/directories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"specialty",name:name.trim()})});
  const row=await response.json();if(response.status===409&&row.id&&row.active){onCreated({id:row.id,name:row.name});setOpen(false);return;}
  if(!response.ok)throw new Error(row.error??"Не удалось создать специальность");onCreated({id:row.id,name:name.trim()});setOpen(false);setName("");
 }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить")}finally{setBusy(false)}}
 if(!canManage)return <p>Создать специальность может пользователь с правом управления справочниками.</p>;
 return <><button type="button" className="button" disabled={demo} onClick={()=>{setError("");setOpen(true)}}>Создать специальность</button>{open&&<RegistryDrawer title="Новая рабочая специальность" subtitle="Используется в назначениях, сменах и табеле. Совпадение названия будет выбрано без создания дубля." onClose={()=>{if(!busy)setOpen(false)}} footer={<><button className="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="button primary" disabled={busy||name.trim().length<2} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить специальность"}</button></>}><label className="field">Название специальности<input value={name} onChange={e=>setName(e.target.value)} maxLength={240}/></label>{error&&<p role="alert">{error}</p>}</RegistryDrawer>}</>;
}

export function WorkerSpecialtiesCatalog({rows,canManage,demo}:{rows:Specialty[];canManage:boolean;demo:boolean}){
 const [items,setItems]=useState(rows);
 return <section className="section"><div className="section-head"><div><h2>Рабочие специальности</h2><p>Для линейных сотрудников на объектах. Должностные профили и процессные роли организации ведутся отдельно.</p></div><CreateWorkerSpecialty canManage={canManage} demo={demo} onCreated={row=>setItems(items=>[...items.filter(x=>x.id!==row.id),row].sort((a,b)=>a.name.localeCompare(b.name,"ru")))}/></div>{items.length?<ul>{items.map(row=><li key={row.id}>{row.name}</li>)}</ul>:<p className="empty-inline">Специальностей пока нет. Создайте первую здесь или прямо при назначении сотрудника.</p>}</section>;
}
