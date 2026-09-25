"use client";

import {useMemo,useState} from "react";
import type {InventoryItemRow,ObjectPpeTemplateRow} from "@/lib/operations/service";

type SpecialtyOption={id:string;name:string};

export function ObjectPpeTemplatesWorkspace({
  objectId,templates,inventoryItems,specialties,canManage,demo,
}:{
  objectId:string;
  templates:ObjectPpeTemplateRow[];
  inventoryItems:InventoryItemRow[];
  specialties:SpecialtyOption[];
  canManage:boolean;
  demo:boolean;
}){
  const ppeItems=useMemo(()=>inventoryItems.filter(item=>["workwear","ppe"].includes(item.category)),[inventoryItems]);
  const options=useMemo(()=>{
    const map=new Map<string,string>();
    for(const item of specialties)map.set(item.id,item.name);
    for(const item of templates)map.set(item.specialtyId,item.specialty);
    return [...map].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[specialties,templates]);
  const [specialtyId,setSpecialtyId]=useState(options[0]?.id??"");
  const [selected,setSelected]=useState<Record<string,boolean>>(()=>selectedFromTemplate(templates.find(item=>item.specialtyId===(options[0]?.id??""))));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  function chooseSpecialty(value:string){
    setSpecialtyId(value);
    setSelected(selectedFromTemplate(templates.find(item=>item.specialtyId===value)));
    setMessage("");
  }
  async function save(){
    if(!canManage||!specialtyId)return;
    setBusy(true);setMessage("");
    try{
      const items=ppeItems.filter(item=>selected[item.id]).map(item=>({
        itemId:item.id,
        quantity:1,
        sizeSource:/ботин|обув/i.test(item.name)?"shoe":item.category==="workwear"?"clothing":"none",
        variant:"",
      }));
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/ppe-template`,{
          method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({specialtyId,items}),
        });
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сохранить комплект");
        window.location.reload();
      }else setMessage("Демо: состав комплекта изменён локально");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить комплект")}
    finally{setBusy(false)}
  }

  if(!options.length)return <div className="empty-inline">Сначала добавьте специальности на объекте.</div>;
  return <div className="object-ppe-workspace">
    <div className="object-ppe-template-list">
      {options.map(option=>{
        const template=templates.find(item=>item.specialtyId===option.id);
        return <button type="button" key={option.id} className={specialtyId===option.id?"active":""} onClick={()=>chooseSpecialty(option.id)}>
          <strong>{option.name}</strong>
          <span>{template?.items.length?template.items.map(item=>item.item).join(" · "):"Комплект не задан"}</span>
        </button>;
      })}
    </div>
    <div className="object-ppe-template-editor-panel">
      <div>
        <strong>{options.find(item=>item.id===specialtyId)?.name??"Специальность"}</strong>
        <span>Выберите обязательные позиции. Размер одежды и обуви берётся из карточки сотрудника.</span>
      </div>
      <div className="object-ppe-template-items">
        {ppeItems.map(item=><label key={item.id}>
          <input type="checkbox" checked={Boolean(selected[item.id])} disabled={!canManage} onChange={event=>setSelected(current=>({...current,[item.id]:event.target.checked}))}/>
          <span>{item.name}</span>
        </label>)}
        {!ppeItems.length&&<span className="cell-sub">В справочнике нет активных позиций СИЗ или рабочей одежды.</span>}
      </div>
      {canManage&&<button className="button primary" type="button" disabled={busy||!ppeItems.length} onClick={()=>void save()}>{busy?"Сохраняем…":"Сохранить комплект"}</button>}
    </div>
    {message&&<div className="object-staffing-message">{message}</div>}
  </div>;
}

function selectedFromTemplate(template:ObjectPpeTemplateRow|undefined){
  return Object.fromEntries((template?.items??[]).map(item=>[item.itemId,true]));
}
