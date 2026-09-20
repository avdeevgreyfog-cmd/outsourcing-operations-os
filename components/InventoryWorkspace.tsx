"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightLeft, PackagePlus, Plus, RotateCcw, Trash2, UserRound, X } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import type { InventorySnapshot, OperationsReferenceData } from "@/lib/operations/service";

type MovementType="receipt"|"transfer"|"issue"|"return"|"writeoff";
const categoryLabels:Record<string,string>={workwear:"Спецодежда",ppe:"СИЗ",tool:"Инструмент",equipment:"Оборудование",consumable:"Расходник",other:"Другое"};
const locationLabels:Record<string,string>={office:"Офис",manager:"Запас менеджера",object:"Объект",housing:"Жильё",vehicle:"Автомобиль",other:"Другое"};

export function InventoryWorkspace({snapshot,options,canManage,demo}:{snapshot:InventorySnapshot;options:OperationsReferenceData;canManage:boolean;demo:boolean}){
  const [showMovement,setShowMovement]=useState(false);
  const [showLocation,setShowLocation]=useState(false);
  const [showItem,setShowItem]=useState(false);
  const [type,setType]=useState<MovementType>("receipt");
  const [itemId,setItemId]=useState(snapshot.items[0]?.id??"");
  const [variant,setVariant]=useState("");
  const [quantity,setQuantity]=useState("1");
  const [fromLocationId,setFromLocationId]=useState("");
  const [toLocationId,setToLocationId]=useState(snapshot.locations[0]?.id??"");
  const [workerId,setWorkerId]=useState("");
  const [condition,setCondition]=useState("good");
  const [note,setNote]=useState("");
  const [writeoffAfterReturn,setWriteoffAfterReturn]=useState(false);
  const [locationName,setLocationName]=useState("");
  const [locationKind,setLocationKind]=useState("manager");
  const [locationObjectId,setLocationObjectId]=useState("");
  const [itemName,setItemName]=useState("");
  const [itemCategory,setItemCategory]=useState("workwear");
  const [itemUnit,setItemUnit]=useState("шт");
  const [itemReturnable,setItemReturnable]=useState(true);
  const [itemTracksVariant,setItemTracksVariant]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [limitDrafts,setLimitDrafts]=useState<Record<string,string>>({});

  const total=snapshot.balances.reduce((sum,row)=>sum+row.quantity,0);
  const low=snapshot.balances.filter(row=>row.minQuantity>0&&row.quantity<=row.minQuantity).length;
  const grouped=useMemo(()=>snapshot.balances,[snapshot.balances]);

  function openMovement(next:MovementType,row?:InventorySnapshot["balances"][number]){
    setType(next);setError("");setWriteoffAfterReturn(false);
    if(row){setItemId(row.itemId);setVariant(row.variant);setFromLocationId(row.locationId);setToLocationId(row.locationId);}
    setShowMovement(true);
  }
  async function post(url:string,body:unknown,method="POST"){
    if(demo){window.location.reload();return;}
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");window.location.reload();
  }
  async function saveMovement(){
    setBusy(true);setError("");
    try{
      await post("/api/assets/movements",{itemId,variant,movementType:type,quantity:Number(quantity),fromLocationId:needsFrom(type)?fromLocationId||null:null,toLocationId:needsTo(type)?toLocationId||null:null,workerId:needsWorker(type)?workerId||null:null,condition,note:note||null,writeoffAfterReturn:type==="return"&&writeoffAfterReturn});
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить движение");}finally{setBusy(false);}
  }
  async function saveLocation(){
    setBusy(true);setError("");try{await post("/api/assets/locations",{name:locationName,kind:locationKind,objectId:locationKind==="object"?locationObjectId||null:null});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать место хранения");}finally{setBusy(false);}
  }
  async function saveItem(){
    setBusy(true);setError("");try{await post("/api/assets/items",{name:itemName,category:itemCategory,unit:itemUnit,returnable:itemReturnable,tracksVariant:itemTracksVariant});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать позицию");}finally{setBusy(false);}
  }
  async function saveLimit(row:InventorySnapshot["balances"][number]){
    const key=`${row.locationId}:${row.itemId}:${row.variant}`;
    const value=Number(limitDrafts[key]??row.minQuantity);
    setBusy(true);setError("");try{await post("/api/assets/limits",{locationId:row.locationId,itemId:row.itemId,variant:row.variant,minQuantity:value},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить минимум");}finally{setBusy(false);}
  }

  return <div>
    <div className="metrics-grid"><Metric label="Места хранения" value={snapshot.locations.length}/><Metric label="Номенклатура" value={snapshot.items.length}/><Metric label="Единиц в запасе" value={total}/><Metric label="Ниже минимума" value={low} tone={low?"warn":"good"}/></div>
    <div className="candidate-directory-viewbar">
      <div className="summary-strip"><span>Запасы учитываются по фактическим местам хранения: офис, менеджер, объект, автомобиль и другие точки.</span></div>
      {canManage&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>setShowLocation(true)}><Plus size={14}/> Место хранения</button><button className="button" onClick={()=>setShowItem(true)}><PackagePlus size={14}/> Номенклатура</button><button className="button primary" onClick={()=>openMovement("receipt")}><Plus size={14}/> Движение</button></div>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Позиция</th><th>Категория</th><th>Вариант / размер</th><th>Место хранения</th><th>Остаток</th><th>Минимум</th><th>Состояние</th>{canManage&&<th>Действия</th>}</tr></thead>
      <tbody>{grouped.map(row=>{const key=`${row.locationId}:${row.itemId}:${row.variant}`;const lowStock=row.minQuantity>0&&row.quantity<=row.minQuantity;return <tr key={key}>
        <td><strong className="cell-title">{row.item}</strong><span className="cell-sub">{row.code??row.unit}</span></td><td>{categoryLabels[row.category]??row.category}</td><td>{row.variant||"—"}</td><td>{row.location}<span className="cell-sub">{locationLabels[row.locationKind]??row.locationKind}</span></td><td className="num">{row.quantity} {row.unit}</td>
        <td>{canManage?<div style={{display:"flex",gap:6,alignItems:"center"}}><input style={{width:72}} type="number" min="0" value={limitDrafts[key]??String(row.minQuantity)} onChange={e=>setLimitDrafts(current=>({...current,[key]:e.target.value}))}/><button className="button" disabled={busy} onClick={()=>void saveLimit(row)}>Сохранить</button></div>:row.minQuantity}</td>
        <td><Status tone={lowStock?"warn":"good"}>{lowStock?"Требует пополнения":"В норме"}</Status></td>
        {canManage&&<td><div className="page-actions">{lowStock&&<Link className="button" href={"/procurement?item="+row.itemId+"&location="+row.locationId}>Заявка</Link>}<button className="icon-button" title="Переместить" onClick={()=>openMovement("transfer",row)}><ArrowRightLeft size={14}/></button><button className="icon-button" title="Выдать сотруднику" onClick={()=>openMovement("issue",row)}><UserRound size={14}/></button><button className="icon-button" title="Списать" onClick={()=>openMovement("writeoff",row)}><Trash2 size={14}/></button></div></td>}
      </tr>})}</tbody>
    </table>{!grouped.length&&<div className="empty-inline">Остатков пока нет. Создайте место хранения и оформите поступление.</div>}</div></section>
    {canManage&&<div className="summary-strip"><strong>Возврат сотрудника:</strong><span>при возврате можно отметить состояние вещи и сразу списать повреждённый или непригодный предмет.</span><button className="button" onClick={()=>openMovement("return")}><RotateCcw size={14}/> Оформить возврат</button></div>}

    {showMovement&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowMovement(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>{movementLabel(type)}</h2><p>Каждое движение сохраняется в истории. Остаток не редактируется вручную.</p></div><button className="icon-button" onClick={()=>setShowMovement(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Операция<select value={type} onChange={e=>setType(e.target.value as MovementType)}><option value="receipt">Поступление</option><option value="transfer">Перемещение</option><option value="issue">Выдача сотруднику</option><option value="return">Возврат от сотрудника</option><option value="writeoff">Списание</option></select></label>
        <label>Позиция<select value={itemId} onChange={e=>setItemId(e.target.value)}>{snapshot.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Размер / вариант<input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="Например 43 или 52"/></label>
        <label>Количество<input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        {needsFrom(type)&&<label>Откуда<select value={fromLocationId} onChange={e=>setFromLocationId(e.target.value)}><option value="">Выберите</option>{snapshot.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {needsTo(type)&&<label>Куда<select value={toLocationId} onChange={e=>setToLocationId(e.target.value)}><option value="">Выберите</option>{snapshot.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {needsWorker(type)&&<label>Сотрудник<select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(x=><option key={x.id} value={x.id}>{x.fullName}{x.object?` · ${x.object}`:""}</option>)}</select></label>}
        {(type==="return"||type==="writeoff")&&<label>Состояние<select value={condition} onChange={e=>setCondition(e.target.value)}><option value="good">Хорошее</option><option value="worn">Изношено</option><option value="damaged">Повреждено</option><option value="unusable">Непригодно</option></select></label>}
      </div>
      {type==="return"&&<label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={writeoffAfterReturn} onChange={e=>setWriteoffAfterReturn(e.target.checked)}/> Списать сразу после возврата</label>}
      <label>Комментарий<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Причина списания, состояние, номер заявки и т. п."/></label>
      {error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowMovement(false)}>Отмена</button><button className="button primary" disabled={busy||!itemId||!quantity} onClick={()=>void saveMovement()}>{busy?"Сохраняю…":"Сохранить движение"}</button></div>
    </div></div></Portal>}

    {showLocation&&<Portal><div className="recruiting-modal"><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Место хранения</h2><p>Это может быть офис, запас менеджера, объект, автомобиль или другая точка.</p></div><button className="icon-button" onClick={()=>setShowLocation(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Название<input value={locationName} onChange={e=>setLocationName(e.target.value)}/></label><label>Тип<select value={locationKind} onChange={e=>setLocationKind(e.target.value)}>{Object.entries(locationLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{locationKind==="object"&&<label>Объект<select value={locationObjectId} onChange={e=>setLocationObjectId(e.target.value)}><option value="">Выберите</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowLocation(false)}>Отмена</button><button className="button primary" disabled={busy||!locationName} onClick={()=>void saveLocation()}>Создать</button></div></div></div></Portal>}

    {showItem&&<Portal><div className="recruiting-modal"><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Номенклатура</h2><p>Одежда, СИЗ, инструмент, оборудование и расходные материалы.</p></div><button className="icon-button" onClick={()=>setShowItem(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Название<input value={itemName} onChange={e=>setItemName(e.target.value)}/></label><label>Категория<select value={itemCategory} onChange={e=>setItemCategory(e.target.value)}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Единица<input value={itemUnit} onChange={e=>setItemUnit(e.target.value)}/></label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={itemReturnable} onChange={e=>setItemReturnable(e.target.checked)}/> Возвратное имущество</label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={itemTracksVariant} onChange={e=>setItemTracksVariant(e.target.checked)}/> Учитывать размеры / варианты</label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowItem(false)}>Отмена</button><button className="button primary" disabled={busy||!itemName} onClick={()=>void saveItem()}>Создать</button></div></div></div></Portal>}
  </div>;
}
function movementLabel(type:MovementType){return type==="receipt"?"Поступление":type==="transfer"?"Перемещение":type==="issue"?"Выдача сотруднику":type==="return"?"Возврат от сотрудника":"Списание"}
function needsFrom(type:MovementType){return ["transfer","issue","writeoff"].includes(type)}
function needsTo(type:MovementType){return ["receipt","transfer","return"].includes(type)}
function needsWorker(type:MovementType){return ["issue","return"].includes(type)}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
