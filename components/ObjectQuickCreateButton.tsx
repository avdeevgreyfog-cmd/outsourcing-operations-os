"use client";

import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import {InlineClientContact} from "./InlineClientContact";
import {useState} from "react";
import type {ObjectManagementOptions} from "@/lib/operations/object-management";

type Option={id:string;name:string};
type OptionKind="client"|"legalEntity"|"region";
const blankOptions:ObjectManagementOptions={clients:[],legalEntities:[],regions:[],managers:[],recruiters:[]};

/** Embedded quick start preserves the parent form and selects the new object without navigation. */
export function ObjectQuickCreateButton({demo,onCreated}:{demo:boolean;onCreated:(object:Option)=>void}){
  const [open,setOpen]=useState(false);
  const [options,setOptions]=useState(blankOptions);
  const [name,setName]=useState("");
  const [contactId,setContactId]=useState("");
  const [clientId,setClientId]=useState("");
  const [legalEntityId,setLegalEntityId]=useState("");
  const [regionId,setRegionId]=useState("");
  const [address,setAddress]=useState("");
  const [actualStartDate,setActualStartDate]=useState("");
  const [inline,setInline]=useState<OptionKind|null>(null);
  const [inlineName,setInlineName]=useState("");
  const [duplicates,setDuplicates]=useState<Option[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function show(){
    setOpen(true);setBusy(true);setError("");
    try{
      const response=await fetch("/api/objects/options");const json=await response.json();
      if(!response.ok)throw new Error(json.error??"Не удалось загрузить параметры");
      setOptions(json);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить параметры");}finally{setBusy(false);}
  }
  function selectOption(item:Option){
    if(inline==="client"){setClientId(item.id);setContactId("");setOptions(current=>({...current,clients:[...current.clients.filter(row=>row.id!==item.id),item]}));}
    if(inline==="legalEntity"){setLegalEntityId(item.id);setOptions(current=>({...current,legalEntities:[...current.legalEntities.filter(row=>row.id!==item.id),{...item,shortName:null,primary:false}]}));}
    if(inline==="region"){setRegionId(item.id);setOptions(current=>({...current,regions:[...current.regions.filter(row=>row.id!==item.id),item]}));}
    setInline(null);setDuplicates([]);setError("");
  }
  async function createOption(){
    if(busy||!inline)return;setBusy(true);setError("");
    try{
      if(demo){
        const collection=inline==="client"?options.clients:inline==="legalEntity"?options.legalEntities:options.regions;
        const matches=collection.filter(row=>row.name.trim().toLocaleLowerCase("ru")===inlineName.trim().toLocaleLowerCase("ru"));
        if(matches.length){setDuplicates(matches);return;}
        selectOption({id:crypto.randomUUID(),name:inlineName.trim()});return;
      }
      const response=await fetch("/api/objects/options",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:inline,name:inlineName})});
      const json=await response.json();if(json.error)throw new Error(json.error);
      if(json.duplicates){setDuplicates(json.duplicates);return;}
      if(!response.ok)throw new Error("Не удалось создать запись");selectOption(json);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать запись");}finally{setBusy(false);}
  }
  async function create(){
    if(busy||name.trim().length<2)return;setBusy(true);setError("");
    try{
      let created:Option;
      if(demo)created={id:crypto.randomUUID(),name:name.trim()};
      else{
        const response=await fetch("/api/objects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,clientId:clientId||null,contactId:contactId||null,legalEntityId:legalEntityId||null,regionId:regionId||null,address:address||null,actualStartDate:actualStartDate||null,status:"active"})});
        const json=await response.json();if(!response.ok)throw new Error(json.error??"Не удалось создать объект");created=json;
      }
      onCreated(created);setOpen(false);setName("");setClientId("");setLegalEntityId("");setRegionId("");setAddress("");setActualStartDate("");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать объект");}finally{setBusy(false);}
  }
  function startInline(kind:OptionKind){setInline(kind);setInlineName("");setDuplicates([]);setError("");}
  return <><button type="button" className="button" onClick={()=>void show()}>Создать объект</button>{open&&<RegistryDrawer title="Быстрый старт объекта" subtitle="Добавить действующий объект" className="object-create-drawer" onClose={()=>{if(!busy)setOpen(false)}} footer={<><button type="button" className="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button type="button" className="button primary" disabled={busy||name.trim().length<2||inline!==null} onClick={()=>void create()}>{busy?"Сохраняю…":"Создать объект"}</button></>}>
      <p className="form-hint">Достаточно названия. Остальные сведения можно дополнить в карточке объекта.</p>
      <div className="object-create-form">
        <label className="wide">Название объекта<input value={name} onChange={e=>setName(e.target.value)} placeholder="Симферопольское / Боброво"/></label>
        <label>Клиент<select value={clientId} onChange={e=>{setClientId(e.target.value);setContactId("")}}><option value="">Не указано</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="button" disabled={busy||options.creationPermissions?.client===false} onClick={()=>startInline("client")}>Создать клиента</button></label>
        <InlineClientContact key={clientId} clientId={clientId} demo={demo} value={contactId} onChange={setContactId}/>
        <label>Наше юрлицо<select value={legalEntityId} onChange={e=>setLegalEntityId(e.target.value)}><option value="">Не указано</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.shortName??item.name}</option>)}</select><button type="button" className="button" disabled={busy||options.creationPermissions?.legalEntity===false} onClick={()=>startInline("legalEntity")}>Создать наше юрлицо</button></label>
        <label>Регион<select value={regionId} onChange={e=>setRegionId(e.target.value)}><option value="">Не указано</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="button" disabled={busy||options.creationPermissions?.region===false} onClick={()=>startInline("region")}>Добавить регион</button></label>
        <label>Фактическая дата начала<input type="date" value={actualStartDate} onChange={e=>setActualStartDate(e.target.value)}/>{!actualStartDate&&<small>Дата неизвестна</small>}</label>
        <label className="wide">Адрес<input value={address} onChange={e=>setAddress(e.target.value)}/></label>
      </div>
      {inline&&<div className="object-create-form"><label className="wide">{inline==="client"?"Новый клиент":inline==="legalEntity"?"Новое наше юрлицо":"Новый регион"}<input value={inlineName} onChange={e=>{setInlineName(e.target.value);setDuplicates([])}}/></label>{duplicates.length>0&&<div className="wide" role="alert"><p>Найдено совпадение по названию. Выберите существующую запись.</p>{duplicates.map(item=><button type="button" key={item.id} className="button" onClick={()=>selectOption(item)}>{item.name}</button>)}</div>}<button type="button" className="button" disabled={busy||inlineName.trim().length<2} onClick={()=>void createOption()}>Создать</button><button type="button" className="button" disabled={busy} onClick={()=>setInline(null)}>Вернуться к объекту</button></div>}
      {error&&<div role="alert" className="form-error">{error}</div>}
</RegistryDrawer>}</>;
}
