"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import {Plus,RotateCcw,Trash2} from "lucide-react";
import type {InventoryItemRow,ObjectPpeTemplateRow} from "@/lib/operations/service";

type SpecialtyOption={id:string;name:string};
type DraftRow={itemId:string;quantity:string;sizeSource:"none"|"clothing"|"shoe"|"manual";replacementCycleDays:string};
const sizeLabels:Record<DraftRow["sizeSource"],string>={none:"Без размера",clothing:"Размер одежды",shoe:"Размер обуви",manual:"Указать вручную"};
const categoryLabels:Record<string,string>={workwear:"Спецодежда",ppe:"СИЗ",tool:"Инструмент",equipment:"Оборудование",other:"Другое"};

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
  const normItems=useMemo(()=>inventoryItems.filter(item=>item.category!=="consumable").sort((a,b)=>a.name.localeCompare(b.name,"ru")),[inventoryItems]);
  const options=useMemo(()=>specialties.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru")),[specialties]);
  const first=options[0]?.id??"";
  const [specialtyId,setSpecialtyId]=useState(first);
  const [draft,setDraft]=useState<DraftRow[]>(()=>draftFromTemplate(templates.find(item=>item.specialtyId===first)));
  const [addItemId,setAddItemId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const currentName=options.find(item=>item.id===specialtyId)?.name??"Специальность";
  const currentTemplate=templates.find(item=>item.specialtyId===specialtyId);
  const available=normItems.filter(item=>!draft.some(row=>row.itemId===item.id));

  function chooseSpecialty(value:string){
    setSpecialtyId(value);
    setDraft(draftFromTemplate(templates.find(item=>item.specialtyId===value)));
    setAddItemId("");
    setMessage("");
  }
  function addItem(){
    const item=normItems.find(row=>row.id===addItemId);if(!item)return;
    const sizeSource:DraftRow["sizeSource"]=/ботин|обув|сапог|кроссов/i.test(item.name)?"shoe":item.category==="workwear"?"clothing":"none";
    setDraft(current=>[...current,{itemId:item.id,quantity:"1",sizeSource,replacementCycleDays:""}]);
    setAddItemId("");
  }
  function patchRow(itemId:string,patch:Partial<DraftRow>){setDraft(current=>current.map(row=>row.itemId===itemId?{...row,...patch}:row))}
  function removeRow(itemId:string){setDraft(current=>current.filter(row=>row.itemId!==itemId))}
  async function resetToBase(){
    if(!canManage||!specialtyId||currentTemplate?.source!=="object")return;
    setBusy(true);setMessage("");
    try{
      if(!demo){
        const response=await fetch("/api/objects/"+objectId+"/ppe-template/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({specialtyId})});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сбросить норму");
        window.location.reload();
      }else setMessage("Демо: норма объекта сброшена к базовой");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сбросить норму")}
    finally{setBusy(false)}
  }
  async function save(){
    if(!canManage||!specialtyId)return;
    setBusy(true);setMessage("");
    try{
      const items=draft.map(row=>({
        itemId:row.itemId,
        quantity:Math.max(.001,Number(row.quantity)||1),
        sizeSource:row.sizeSource,
        variant:"",
        replacementCycleDays:row.replacementCycleDays?Math.max(1,Number(row.replacementCycleDays)):null,
      }));
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/ppe-template`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({specialtyId,items})});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сохранить норму");
        window.location.reload();
      }else setMessage("Демо: норма обеспечения изменена локально");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить норму обеспечения")}
    finally{setBusy(false)}
  }

  if(!options.length)return <div className="empty-inline">Сначала добавьте специальности на объекте.</div>;
  return <div className="object-ppe-workspace object-supply-norms">
    <div className="object-supply-norm-toolbar">
      <label><span>Специальность на объекте</span><select value={specialtyId} onChange={event=>chooseSpecialty(event.target.value)}>{options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <div className="object-supply-norm-source"><strong>{currentTemplate?.source==="object"?"Норма объекта":currentTemplate?.source==="global"?"Базовая норма":"Норма не задана"}</strong><span>{currentTemplate?.source==="object"?"Локальное переопределение для этого объекта.":currentTemplate?.source==="global"?"Подтянута из общего контура обеспечения. Сохранение здесь создаст локальное переопределение.":"Сначала можно задать базовую норму в общем обеспечении или настроить её прямо здесь."}</span><Link className="table-link" href="/assets?view=norms">Открыть базовые нормы</Link></div>
    </div>
    <div className="object-ppe-template-editor-panel">
      <header className="object-supply-norm-head">
        <div><strong>{currentName}</strong><span>Индивидуальное обеспечение сотрудника этой специальности. Расходники учитываются отдельно на объект.</span></div>
        {canManage&&currentTemplate?.source==="object"&&<button className="button" type="button" disabled={busy} onClick={()=>void resetToBase()}><RotateCcw size={14}/> Сбросить к базовой</button>}
      </header>

      <div className="request-table-wrap object-supply-norm-table"><table className="data-table">
        <thead><tr><th>Позиция</th><th>Категория</th><th>Количество</th><th>Размер</th><th>Обновлять</th>{canManage&&<th aria-label="Удалить"></th>}</tr></thead>
        <tbody>{draft.map(row=>{const item=normItems.find(value=>value.id===row.itemId);return <tr key={row.itemId}>
          <td><strong className="cell-title">{item?.name??"Позиция удалена из справочника"}</strong><span className="cell-sub">{item?.unit??"—"}</span></td>
          <td>{categoryLabels[item?.category??""]??item?.category??"—"}</td>
          <td><div className="object-norm-quantity"><input type="number" min=".001" step=".001" value={row.quantity} disabled={!canManage} onChange={event=>patchRow(row.itemId,{quantity:event.target.value})}/><span>{item?.unit??""}</span></div></td>
          <td><select value={row.sizeSource} disabled={!canManage} onChange={event=>patchRow(row.itemId,{sizeSource:event.target.value as DraftRow["sizeSource"]})}>{Object.entries(sizeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
          <td><div className="object-norm-cycle"><input type="number" min="1" max="3650" value={row.replacementCycleDays} disabled={!canManage} onChange={event=>patchRow(row.itemId,{replacementCycleDays:event.target.value})} placeholder="—"/><span>дн.</span></div></td>
          {canManage&&<td><button className="icon-button" type="button" aria-label={"Удалить "+(item?.name??"позицию")} onClick={()=>removeRow(row.itemId)}><Trash2 size={14}/></button></td>}
        </tr>})}</tbody>
      </table>{!draft.length&&<div className="empty-inline">Для специальности пока не задано индивидуальное обеспечение.</div>}</div>

      {canManage&&<div className="object-supply-norm-add">
        <select value={addItemId} onChange={event=>setAddItemId(event.target.value)}><option value="">Добавить позицию…</option>{available.map(item=><option key={item.id} value={item.id}>{item.name} · {categoryLabels[item.category]??item.category}</option>)}</select>
        <button className="button" type="button" disabled={!addItemId} onClick={addItem}><Plus size={14}/> Добавить</button>
        <button className="button primary" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняем…":currentTemplate?.source==="global"?"Переопределить для объекта":"Сохранить для объекта"}</button>
      </div>}
      {message&&<div className="object-staffing-message">{message}</div>}
    </div>
  </div>;
}

function draftFromTemplate(template:ObjectPpeTemplateRow|undefined):DraftRow[]{
  return (template?.items??[]).map(item=>({
    itemId:item.itemId,
    quantity:String(Number(item.quantity)),
    sizeSource:item.sizeSource,
    replacementCycleDays:item.replacementCycleDays==null?"":String(item.replacementCycleDays),
  }));
}
