"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import {InventoryWorkspace} from "@/components/InventoryWorkspace";
import {InventoryItemsWorkspace,StorageLocationsWorkspace} from "@/components/InventoryDirectoryWorkspace";
import {GlobalPpeTemplatesWorkspace} from "@/components/GlobalPpeTemplatesWorkspace";
import {Section} from "@/components/UI";
import type {InventorySnapshot,ObjectPpeTemplateRow,OperationsReferenceData} from "@/lib/operations/service";
import type {InventoryMovementRow,WorkerAssetHoldingRow} from "@/lib/operations/supply-control";
import {rub} from "@/lib/ui/format";

type View="stock"|"items"|"locations"|"holdings"|"movements"|"norms";
const movementLabels:Record<string,string>={opening:"Начальный остаток",receipt:"Поступление",transfer:"Перемещение",issue:"Выдача",return:"Возврат",writeoff:"Списание",adjustment_in:"Корректировка +",adjustment_out:"Корректировка −",recondition:"Изменение состояния"};
const conditionLabels:Record<string,string>={new:"Новое",good:"Годно",worn:"Обслуживание",damaged:"Ремонт",unusable:"Непригодно"};

export function SupplyAssetsWorkspace({
  snapshot,options,templates,movements,holdings,canManage,demo,initialWorkerId,initialAction,initialItemId,initialVariant,initialObjectId,initialView="stock",
}:{
  snapshot:InventorySnapshot;options:OperationsReferenceData;templates:ObjectPpeTemplateRow[];movements:InventoryMovementRow[];holdings:WorkerAssetHoldingRow[];
  canManage:boolean;demo:boolean;initialWorkerId?:string|null;initialAction?:"issue"|"return"|null;initialItemId?:string|null;initialVariant?:string|null;initialObjectId?:string|null;initialView?:View;
}){
  const [view,setView]=useState<View>(initialView);
  const [manager,setManager]=useState("all");
  const [objectId,setObjectId]=useState(initialObjectId??"all");
  const managers=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const visibleObjects=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);
  const managerId=manager==="all"?"":manager;
  const selectedObject=objectId==="all"?"":objectId;
  const filteredHoldings=useMemo(()=>holdings.filter(row=>(manager==="all"||row.ownerUserId===manager)&&(objectId==="all"||row.objectId===objectId)),[holdings,manager,objectId]);
  const filteredMovements=useMemo(()=>movements.filter(row=>(manager==="all"||row.ownerUserId===manager)&&(objectId==="all"||row.objectId===objectId)),[movements,manager,objectId]);
  const filteredBalances=snapshot.balances.filter(row=>(manager==="all"||row.ownerUserId===manager)&&(objectId==="all"||row.objectId===objectId));
  const low=filteredBalances.filter(row=>row.minQuantity>0&&row.usableQuantity<=row.minQuantity).length;
  const usable=filteredBalances.reduce((sum,row)=>sum+row.usableQuantity,0);
  const service=filteredBalances.reduce((sum,row)=>sum+row.serviceQuantity+row.repairQuantity,0);
  const onWorkers=filteredHoldings.reduce((sum,row)=>sum+row.quantity,0);
  const showScope=["stock","locations","holdings","movements"].includes(view);

  return <div className="supply-assets-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Годно к выдаче</span><strong>{usable}</strong><small>новое и пригодное б/у</small></div>
      <div className="metric"><span>На сотрудниках</span><strong>{onWorkers}</strong><small>единиц имущества учтено на руках</small></div>
      <div className="metric"><span>Обслуживание / ремонт</span><strong>{service}</strong><small>ещё нельзя выдавать</small></div>
      <div className="metric"><span>Ниже минимума</span><strong>{low}</strong><small>позиции требуют пополнения</small></div>
    </div>

    <div className="object-local-tabs supply-assets-views supply-portfolio-tabs" role="tablist" aria-label="Запасы и имущество">
      <button type="button" className={view==="stock"?"active":""} onClick={()=>setView("stock")}>Остатки</button>
      <button type="button" className={view==="items"?"active":""} onClick={()=>setView("items")}>Товары <span>{snapshot.items.length}</span></button>
      <button type="button" className={view==="locations"?"active":""} onClick={()=>setView("locations")}>Места хранения <span>{snapshot.locations.length}</span></button>
      <button type="button" className={view==="holdings"?"active":""} onClick={()=>setView("holdings")}>На сотрудниках <span>{filteredHoldings.length}</span></button>
      <button type="button" className={view==="movements"?"active":""} onClick={()=>setView("movements")}>Движения <span>{filteredMovements.length}</span></button>
      <button type="button" className={view==="norms"?"active":""} onClick={()=>setView("norms")}>Комплекты и нормы</button>
    </div>

    {showScope&&<div className="personnel-portfolio-toolbar supply-portfolio-toolbar"><div className="personnel-portfolio-filters">
      <select value={manager} onChange={e=>{setManager(e.target.value);setObjectId("all")}} aria-label="Менеджер"><option value="all">Все менеджеры</option>{managers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <select value={objectId} onChange={e=>setObjectId(e.target.value)} aria-label="Объект"><option value="all">Все объекты и места</option>{visibleObjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
    </div></div>}

    {view==="stock"&&<InventoryWorkspace snapshot={snapshot} options={options} canManage={canManage} demo={demo} initialWorkerId={initialWorkerId} initialAction={initialAction} initialItemId={initialItemId} initialVariant={initialVariant} initialObjectId={initialObjectId} externalManagerId={managerId} externalObjectId={selectedObject} hideSummary hideScopeControl showDirectoryActions={false}/>}
    {view==="items"&&<InventoryItemsWorkspace snapshot={snapshot} canManage={canManage} demo={demo}/>}
    {view==="locations"&&<StorageLocationsWorkspace snapshot={snapshot} options={options} canManage={canManage} demo={demo} managerId={managerId} objectId={selectedObject}/>}

    {view==="holdings"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table supply-holdings-table">
      <thead><tr><th>Сотрудник</th><th>Менеджер</th><th>Объект</th><th>Позиция</th><th>Размер / вариант</th><th>Количество</th><th>Возврат</th><th></th></tr></thead>
      <tbody>{filteredHoldings.map((row,index)=><tr key={row.workerId+":"+row.itemId+":"+row.variant+":"+index}><td><Link className="cell-title" href={"/workers/"+row.workerId}>{row.worker}</Link></td><td>{row.manager??"—"}</td><td>{row.object??"—"}</td><td>{row.item}</td><td>{row.variant||"—"}</td><td className="num">{row.quantity} {row.unit}</td><td>{row.returnable?"Нужно вернуть":"Не требуется"}</td><td>{canManage&&row.returnable?<Link className="table-link" href={"/assets?worker="+row.workerId+"&action=return"}>Оформить возврат</Link>:null}</td></tr>)}</tbody>
    </table>{!filteredHoldings.length&&<div className="empty-inline">Имущество на сотрудниках по выбранному контуру не найдено.</div>}</div></section>}

    {view==="movements"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table supply-movements-table">
      <thead><tr><th>Дата</th><th>Операция</th><th>Позиция</th><th>Откуда</th><th>Куда / сотрудник</th><th>Состояние</th><th>Объект</th><th>Количество</th><th>Стоимость</th><th>Оформил</th></tr></thead>
      <tbody>{filteredMovements.map(row=>{const state=row.sourceCondition&&row.targetCondition&&row.sourceCondition!==row.targetCondition?(conditionLabels[row.sourceCondition]??row.sourceCondition)+" → "+(conditionLabels[row.targetCondition]??row.targetCondition):(conditionLabels[row.targetCondition??row.sourceCondition??row.condition??""]??"—");return <tr key={row.id}><td>{row.occurredAt}</td><td>{movementLabels[row.movementType]??"Движение"}</td><td><strong className="cell-title">{row.item}</strong><span className="cell-sub">{row.variant||"без варианта"}</span></td><td>{row.fromLocation??"—"}</td><td>{row.worker??row.toLocation??"—"}</td><td>{state}</td><td>{row.object??"—"}{row.manager&&<span className="cell-sub">{row.manager}</span>}</td><td className="num">{row.quantity} {row.unit}</td><td className="num">{row.unitCost==null?"—":rub(row.unitCost*row.quantity)}</td><td>{row.createdBy}</td></tr>})}</tbody>
    </table>{!filteredMovements.length&&<div className="empty-inline">Движений по выбранному контуру пока нет.</div>}</div></section>}

    {view==="norms"&&<Section title="Базовые комплекты и нормы" note="Общие комплекты компании по специальностям. Они включают спецодежду, СИЗ, оборудование и расходники; на объекте состав можно переопределить локально."><GlobalPpeTemplatesWorkspace templates={templates} inventoryItems={snapshot.items} specialties={options.specialties} canManage={canManage} demo={demo}/></Section>}
  </div>;
}
