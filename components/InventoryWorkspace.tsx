"use client";

import {createPortal} from "react-dom";
import Link from "next/link";
import {useMemo,useState} from "react";
import {ArrowRightLeft,PackagePlus,RotateCcw,Trash2,UserRound,Wrench,X} from "lucide-react";
import {Metric,Status} from "@/components/UI";
import type {InventoryBalanceRow,InventorySnapshot,OperationsReferenceData} from "@/lib/operations/service";

type MovementType="receipt"|"transfer"|"issue"|"return"|"writeoff"|"recondition";
type StockCondition="new"|"good"|"worn"|"damaged"|"unusable";

const categoryLabels:Record<string,string>={workwear:"Спецодежда",ppe:"СИЗ",tool:"Инструмент",equipment:"Оборудование",consumable:"Расходник",other:"Другое"};
const locationLabels:Record<string,string>={office:"Офис",manager:"Запас менеджера",object:"Объект",housing:"Жильё",vehicle:"Автомобиль",other:"Другое"};
const conditionLabels:Record<StockCondition,string>={new:"Новое",good:"Годно к выдаче",worn:"Требует обслуживания",damaged:"Требует ремонта",unusable:"Непригодно"};

export function InventoryWorkspace({
  snapshot,options,canManage,demo,initialWorkerId,initialAction,initialItemId,initialVariant,initialObjectId,
  externalManagerId="",externalObjectId="",hideSummary=false,hideScopeControl=false,showDirectoryActions=true,
}:{
  snapshot:InventorySnapshot;options:OperationsReferenceData;canManage:boolean;demo:boolean;
  initialWorkerId?:string|null;initialAction?:"issue"|"return"|null;initialItemId?:string|null;initialVariant?:string|null;initialObjectId?:string|null;
  externalManagerId?:string;externalObjectId?:string;hideSummary?:boolean;hideScopeControl?:boolean;showDirectoryActions?:boolean;
}){
  const initialVariantRow=snapshot.variants.find(row=>row.itemId===initialItemId&&row.label===(initialVariant??""));
  const [showMovement,setShowMovement]=useState(Boolean(initialWorkerId)&&canManage);
  const [type,setType]=useState<MovementType>(initialAction??(initialWorkerId?"return":"receipt"));
  const [itemId,setItemId]=useState(initialItemId??snapshot.items[0]?.id??"");
  const [variantId,setVariantId]=useState(initialVariantRow?.id??"");
  const [variant,setVariant]=useState(initialVariant??"");
  const [quantity,setQuantity]=useState("1");
  const [fromLocationId,setFromLocationId]=useState("");
  const [toLocationId,setToLocationId]=useState(snapshot.locations[0]?.id??"");
  const [workerId,setWorkerId]=useState(initialWorkerId??"");
  const [sourceCondition,setSourceCondition]=useState<StockCondition>("good");
  const [targetCondition,setTargetCondition]=useState<StockCondition>(type==="receipt"?"new":"good");
  const [unitCost,setUnitCost]=useState("");
  const [note,setNote]=useState("");
  const [writeoffAfterReturn,setWriteoffAfterReturn]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [limitDrafts,setLimitDrafts]=useState<Record<string,string>>({});
  const [scopeObjectId,setScopeObjectId]=useState(initialObjectId??"");

  const grouped=useMemo(()=>snapshot.balances.filter(row=>
    (!scopeObjectId||row.objectId===scopeObjectId)&&(!externalObjectId||row.objectId===externalObjectId)&&(!externalManagerId||row.ownerUserId===externalManagerId)
  ),[snapshot.balances,scopeObjectId,externalObjectId,externalManagerId]);
  const totalUsable=grouped.reduce((sum,row)=>sum+row.usableQuantity,0);
  const service=grouped.reduce((sum,row)=>sum+row.serviceQuantity+row.repairQuantity,0);
  const low=grouped.filter(row=>row.minQuantity>0&&row.usableQuantity<=row.minQuantity).length;
  const selectedItem=snapshot.items.find(row=>row.id===itemId);
  const itemVariants=snapshot.variants.filter(row=>row.itemId===itemId&&row.active);

  function preferredCondition(row:InventoryBalanceRow,next:MovementType):StockCondition{
    if(next==="writeoff"){
      if(row.unusableQuantity>0)return "unusable";
      if(row.repairQuantity>0)return "damaged";
      if(row.serviceQuantity>0)return "worn";
    }
    if(next==="recondition"){
      if(row.serviceQuantity>0)return "worn";
      if(row.repairQuantity>0)return "damaged";
    }
    if(row.goodQuantity>0)return "good";
    if(row.newQuantity>0)return "new";
    if(row.serviceQuantity>0)return "worn";
    if(row.repairQuantity>0)return "damaged";
    return "unusable";
  }
  function openMovement(next:MovementType,row?:InventoryBalanceRow){
    setType(next);setError("");setWriteoffAfterReturn(false);setUnitCost("");
    if(row){
      setItemId(row.itemId);setVariant(row.variant);setVariantId(row.variantId??"");
      setFromLocationId(row.locationId);setToLocationId(row.locationId);
      const condition=preferredCondition(row,next);setSourceCondition(condition);setTargetCondition(next==="recondition"?"good":condition);
    }else{
      setFromLocationId("");setToLocationId(snapshot.locations[0]?.id??"");
      setSourceCondition("good");setTargetCondition(next==="receipt"?"new":"good");
    }
    setShowMovement(true);
  }
  function chooseItem(nextId:string){
    setItemId(nextId);
    const variants=snapshot.variants.filter(row=>row.itemId===nextId&&row.active);
    setVariantId(variants[0]?.id??"");setVariant(variants[0]?.label??"");
  }
  function chooseVariant(nextId:string){
    setVariantId(nextId);setVariant(snapshot.variants.find(row=>row.id===nextId)?.label??"");
  }
  async function post(url:string,body:unknown,method="POST"){
    if(demo){window.location.reload();return;}
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");window.location.reload();
  }
  async function saveMovement(){
    setBusy(true);setError("");
    try{
      const reconditionLocation=type==="recondition"?fromLocationId:null;
      await post("/api/assets/movements",{
        itemId,variantId:variantId||null,variant,movementType:type,quantity:Number(quantity),
        fromLocationId:needsFrom(type)?fromLocationId||null:null,
        toLocationId:type==="recondition"?reconditionLocation:needsTo(type)?toLocationId||null:null,
        workerId:needsWorker(type)?workerId||null:null,
        sourceCondition:needsSourceCondition(type)?sourceCondition:null,
        targetCondition:type==="transfer"?sourceCondition:needsTargetCondition(type)?targetCondition:null,
        unitCost:type==="receipt"&&unitCost!==""?Number(unitCost):null,
        note:note||null,writeoffAfterReturn:type==="return"&&writeoffAfterReturn,
      });
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить движение");}finally{setBusy(false);}
  }
  async function saveLimit(row:InventoryBalanceRow){
    const key=`${row.locationId}:${row.itemId}:${row.variant}`;
    const value=Number(limitDrafts[key]??row.minQuantity);
    setBusy(true);setError("");try{await post("/api/assets/limits",{locationId:row.locationId,itemId:row.itemId,variant:row.variant,minQuantity:value},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить минимум");}finally{setBusy(false);}
  }

  return <div className="inventory-workspace">
    {!hideSummary&&<div className="metrics-grid"><Metric label="Места хранения" value={snapshot.locations.length}/><Metric label="Годно к выдаче" value={totalUsable}/><Metric label="Обслуживание / ремонт" value={service}/><Metric label="Ниже минимума" value={low} tone={low?"warn":"good"}/></div>}
    <div className="candidate-directory-viewbar inventory-viewbar">
      {!hideScopeControl&&<div className="inventory-scope-control"><span>Показывать</span><select value={scopeObjectId} onChange={e=>setScopeObjectId(e.target.value)}><option value="">Все места хранения</option>{options.objects.map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select></div>}
      {canManage&&<div className="candidate-directory-buttons">{showDirectoryActions&&<><Link className="button" href="/assets?view=locations"><PackagePlus size={14}/> Места хранения</Link><Link className="button" href="/assets?view=items"><PackagePlus size={14}/> Товары</Link></>}<button className="button primary" onClick={()=>openMovement("receipt")}><PackagePlus size={14}/> Оформить движение</button></div>}
    </div>

    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table inventory-stock-table">
      <thead><tr><th>Позиция</th><th>Категория</th><th>Размер / вариант</th><th>Место хранения</th><th>Годно к выдаче</th><th>Обслуживание / ремонт</th><th>Непригодно</th><th>Минимум</th><th>Состояние</th>{canManage&&<th>Действия</th>}</tr></thead>
      <tbody>{grouped.map(row=>{const key=`${row.locationId}:${row.itemId}:${row.variant}`;const lowStock=row.minQuantity>0&&row.usableQuantity<=row.minQuantity;return <tr key={key}>
        <td><strong className="cell-title">{row.item}</strong><span className="cell-sub">{row.code??row.unit}</span></td>
        <td>{categoryLabels[row.category]??"Другое"}</td><td>{row.variant||"—"}</td><td>{row.location}<span className="cell-sub">{locationLabels[row.locationKind]??"Другое"}</span></td>
        <td className="num"><strong>{row.usableQuantity} {row.unit}</strong><span className="cell-sub">новое {row.newQuantity} · б/у {row.goodQuantity}</span></td>
        <td className="num">{row.serviceQuantity+row.repairQuantity} {row.unit}<span className="cell-sub">обслуж. {row.serviceQuantity} · ремонт {row.repairQuantity}</span></td>
        <td className="num">{row.unusableQuantity||"—"}</td>
        <td>{canManage?<div className="inventory-limit-control"><input type="number" min="0" value={limitDrafts[key]??String(row.minQuantity)} onChange={e=>setLimitDrafts(current=>({...current,[key]:e.target.value}))}/><button className="table-link" disabled={busy} onClick={()=>void saveLimit(row)}>Сохранить</button></div>:row.minQuantity}</td>
        <td><Status tone={lowStock?"warn":"neutral"}>{lowStock?"Нужно пополнить":"В норме"}</Status></td>
        {canManage&&<td><div className="page-actions inventory-row-actions">{lowStock&&<Link className="table-link" href={"/procurement?item="+row.itemId+"&location="+row.locationId}>Заявка</Link>}<button className="icon-button" title="Переместить" onClick={()=>openMovement("transfer",row)}><ArrowRightLeft size={14}/></button><button className="icon-button" title="Выдать сотруднику" onClick={()=>openMovement("issue",row)}><UserRound size={14}/></button>{(row.serviceQuantity>0||row.repairQuantity>0)&&<button className="icon-button" title="Изменить состояние после обслуживания или ремонта" onClick={()=>openMovement("recondition",row)}><Wrench size={14}/></button>}<button className="icon-button" title="Списать" onClick={()=>openMovement("writeoff",row)}><Trash2 size={14}/></button></div></td>}
      </tr>})}</tbody>
    </table>{!grouped.length&&<div className="empty-inline">Остатков пока нет. Оформите поступление в нужное место хранения.</div>}</div></section>
    {canManage&&<div className="summary-strip inventory-return-strip"><strong>Возврат от сотрудника</strong><span>При возврате укажите фактическое состояние: вещь попадёт в пригодный запас, обслуживание, ремонт или списание.</span><button className="button" onClick={()=>openMovement("return")}><RotateCcw size={14}/> Оформить возврат</button></div>}

    {showMovement&&<Portal><div className="recruiting-modal inventory-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowMovement(false)}}><div className="recruiting-modal-card inventory-modal-card">
      <div className="recruiting-modal-head"><div><h2>{movementLabel(type)}</h2><p>Остаток изменяется только через движение и сохраняется в системной истории.</p></div><button className="icon-button" onClick={()=>setShowMovement(false)}><X size={17}/></button></div>
      <div className="candidate-import-body inventory-modal-body"><div className="form-grid two">
        <label><span>Операция</span><select value={type} onChange={e=>{const next=e.target.value as MovementType;setType(next);if(next==="receipt")setTargetCondition("new")}}><option value="receipt">Поступление</option><option value="transfer">Перемещение</option><option value="issue">Выдача сотруднику</option><option value="return">Возврат от сотрудника</option><option value="recondition">Изменение состояния</option><option value="writeoff">Списание</option></select></label>
        <label><span>Позиция</span><select value={itemId} onChange={e=>chooseItem(e.target.value)}>{snapshot.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        {selectedItem?.tracksVariant&&(itemVariants.length?<label><span>Размер / вариант</span><select value={variantId} onChange={e=>chooseVariant(e.target.value)}><option value="">Выберите</option>{itemVariants.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>:<label><span>Размер / вариант</span><input value={variant} onChange={e=>{setVariant(e.target.value);setVariantId("")}} placeholder="Например 43 или 52"/></label>)}
        <label><span>Количество</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        {needsFrom(type)&&<label><span>Откуда</span><select value={fromLocationId} onChange={e=>{setFromLocationId(e.target.value);if(type==="recondition")setToLocationId(e.target.value)}}><option value="">Выберите</option>{snapshot.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {needsTo(type)&&type!=="recondition"&&<label><span>Куда</span><select value={toLocationId} onChange={e=>setToLocationId(e.target.value)}><option value="">Выберите</option>{snapshot.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {needsWorker(type)&&<label><span>Сотрудник</span><select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(x=><option key={x.id} value={x.id}>{x.fullName}{x.object?` · ${x.object}`:""}</option>)}</select></label>}
        {needsSourceCondition(type)&&<label><span>{type==="recondition"?"Текущее состояние":"Состояние выдаваемого запаса"}</span><select value={sourceCondition} onChange={e=>setSourceCondition(e.target.value as StockCondition)}>{Object.entries(conditionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
        {needsTargetCondition(type)&&<label><span>{type==="recondition"?"Новое состояние":"Состояние после операции"}</span><select value={targetCondition} onChange={e=>setTargetCondition(e.target.value as StockCondition)}>{Object.entries(conditionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
        {type==="receipt"&&<label><span>Фактическая цена / ед.</span><input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)} placeholder="Необязательно"/></label>}
        {type==="return"&&<label className="operations-check span-2"><input type="checkbox" checked={writeoffAfterReturn} onChange={e=>setWriteoffAfterReturn(e.target.checked)}/><span>Списать сразу после возврата</span></label>}
        <label className="span-2"><span>Комментарий</span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Причина, состояние, номер заявки и другие пояснения"/></label>
      </div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowMovement(false)}>Отмена</button><button className="button primary" disabled={busy||!itemId||!quantity} onClick={()=>void saveMovement()}>{busy?"Сохраняю…":"Сохранить движение"}</button></div>
    </div></div></Portal>}
  </div>;
}

function movementLabel(type:MovementType){return type==="receipt"?"Поступление":type==="transfer"?"Перемещение":type==="issue"?"Выдача сотруднику":type==="return"?"Возврат от сотрудника":type==="recondition"?"Изменение состояния":"Списание"}
function needsFrom(type:MovementType){return ["transfer","issue","writeoff","recondition"].includes(type)}
function needsTo(type:MovementType){return ["receipt","transfer","return","recondition"].includes(type)}
function needsWorker(type:MovementType){return ["issue","return"].includes(type)}
function needsSourceCondition(type:MovementType){return ["transfer","issue","writeoff","recondition"].includes(type)}
function needsTargetCondition(type:MovementType){return ["receipt","return","recondition"].includes(type)}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
