"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { HousingSnapshot, OperationsReferenceData } from "@/lib/operations/service";
import type { HousingContractRow, SupplyPartnerRow } from "@/lib/operations/supply-control";
import { rub } from "@/lib/ui/format";

type View="housing"|"stays"|"contracts"|"attention";
const rateLabels:Record<string,string>={bed_day:"Койко-место / сутки",bed_month:"Койко-место / месяц",room_day:"Комната / сутки",room_month:"Комната / месяц",site_period:"Фиксировано / период"};

function ruToIso(value:string|null){if(!value)return null;const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+"-"+m[2]+"-"+m[1]:null}
function dueSoon(contract:HousingContractRow){
  const due=ruToIso(contract.nextPaymentDue);if(!due||!contract.active)return false;
  const today=new Date().toISOString().slice(0,10);const future=new Date(today+"T00:00:00Z");future.setUTCDate(future.getUTCDate()+14);
  return due<=future.toISOString().slice(0,10);
}
function contractAttention(contract:HousingContractRow){
  const today=new Date().toISOString().slice(0,10),due=ruToIso(contract.nextPaymentDue),validTo=ruToIso(contract.validTo);
  return Boolean(!contract.signedOn||(due&&due<today)||(validTo&&validTo<=today)||dueSoon(contract));
}

export function HousingPortfolioWorkspace({snapshot,options,contracts,partners,canManage,demo,initialWorkerId}:{snapshot:HousingSnapshot;options:OperationsReferenceData;contracts:HousingContractRow[];partners:SupplyPartnerRow[];canManage:boolean;demo:boolean;initialWorkerId?:string|null}){
  const [view,setView]=useState<View>("housing");
  const [query,setQuery]=useState("");
  const [manager,setManager]=useState("all");
  const [objectId,setObjectId]=useState("all");
  const [showSite,setShowSite]=useState(false);
  const [showStay,setShowStay]=useState(Boolean(initialWorkerId)&&canManage);
  const [showContract,setShowContract]=useState(false);
  const [paymentContract,setPaymentContract]=useState<HousingContractRow|null>(null);
  const [name,setName]=useState("");
  const [address,setAddress]=useState("");
  const [vendor,setVendor]=useState("");
  const [formObjectId,setFormObjectId]=useState(options.objects[0]?.id??"");
  const [rateModel,setRateModel]=useState<"bed_day"|"room_day"|"room_month"|"site_period">("bed_day");
  const [rateAmount,setRateAmount]=useState("");
  const [unitName,setUnitName]=useState("Комната 1");
  const [capacity,setCapacity]=useState("1");
  const [workerId,setWorkerId]=useState(initialWorkerId??"");
  const [siteId,setSiteId]=useState(snapshot.sites[0]?.id??"");
  const [bedLabel,setBedLabel]=useState("");
  const [checkIn,setCheckIn]=useState(new Date().toISOString().slice(0,10));
  const [checkOut,setCheckOut]=useState("");
  const [contractSiteId,setContractSiteId]=useState(snapshot.sites[0]?.id??"");
  const [partnerId,setPartnerId]=useState("");
  const [contractNumber,setContractNumber]=useState("");
  const [signedOn,setSignedOn]=useState("");
  const [validFrom,setValidFrom]=useState(new Date().toISOString().slice(0,10));
  const [validTo,setValidTo]=useState("");
  const [billingModel,setBillingModel]=useState("bed_month");
  const [bookedCapacity,setBookedCapacity]=useState("");
  const [contractRate,setContractRate]=useState("");
  const [depositAmount,setDepositAmount]=useState("");
  const [paymentDay,setPaymentDay]=useState("");
  const [prepaidUntil,setPrepaidUntil]=useState("");
  const [nextPaymentDue,setNextPaymentDue]=useState("");
  const [noticeDays,setNoticeDays]=useState("");
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));
  const [paymentPrepaidUntil,setPaymentPrepaidUntil]=useState("");
  const [paymentNextDue,setPaymentNextDue]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const objectMap=useMemo(()=>new Map(options.objects.map(row=>[row.id,row])),[options.objects]);
  const managers=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const visibleObjects=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);
  const contractBySite=useMemo(()=>new Map(contracts.filter(row=>row.active).map(row=>[row.siteId,row])),[contracts]);
  const activeStays=snapshot.stays.filter(row=>["active","planned"].includes(row.status));

  const visibleSites=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return snapshot.sites.filter(row=>{
      const object=row.objectId?objectMap.get(row.objectId):null;
      if(manager!=="all"&&(object?.ownerUserId??"unassigned")!==manager)return false;
      if(objectId!=="all"&&row.objectId!==objectId)return false;
      const contract=contractBySite.get(row.id);
      return !needle||[row.name,row.address,row.vendor,row.object,object?.ownerName,contract?.partner,contract?.contractNumber].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle);
    });
  },[snapshot.sites,query,manager,objectId,objectMap,contractBySite]);
  const visibleStays=useMemo(()=>activeStays.filter(row=>visibleSites.some(site=>site.id===row.siteId)),[activeStays,visibleSites]);
  const visibleContracts=useMemo(()=>contracts.filter(row=>visibleSites.some(site=>site.id===row.siteId)),[contracts,visibleSites]);
  const reserved=visibleSites.reduce((sum,row)=>sum+(contractBySite.get(row.id)?.bookedCapacity??row.capacity),0);
  const occupied=visibleSites.reduce((sum,row)=>sum+row.occupied,0);
  const freeReserved=Math.max(0,reserved-occupied);
  const forecast=visibleSites.reduce((sum,row)=>sum+row.monthlyForecast,0);
  const attentionContracts=visibleContracts.filter(contractAttention);
  const fullSites=visibleSites.filter(row=>{const booked=contractBySite.get(row.id)?.bookedCapacity??row.capacity;return booked>0&&row.occupied>=booked});
  const attentionCount=new Set([...attentionContracts.map(row=>"c:"+row.id),...fullSites.map(row=>"s:"+row.id)]).size;

  async function post(url:string,body:unknown,method="POST"){
    if(demo){setError("Изменения в демо-режиме недоступны");return false;}
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");window.location.reload();return true;
  }
  async function createSite(){setBusy(true);setError("");try{await post("/api/housing/sites",{name,address:address||null,vendor:vendor||null,objectId:formObjectId,rateModel,rateAmount:Number(rateAmount||0),unitName,capacity:Number(capacity)});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать жильё");}finally{setBusy(false)}}
  async function createStay(){setBusy(true);setError("");try{await post("/api/housing/stays",{workerId,siteId,bedLabel:bedLabel||null,checkIn,checkOut:checkOut||null});}catch(e){setError(e instanceof Error?e.message:"Не удалось заселить сотрудника");}finally{setBusy(false)}}
  async function createContract(){setBusy(true);setError("");try{await post("/api/housing/contracts",{siteId:contractSiteId,partnerId:partnerId||null,contractNumber:contractNumber||null,signedOn:signedOn||null,validFrom,validTo:validTo||null,billingModel,bookedCapacity:bookedCapacity?Number(bookedCapacity):null,rateAmount:Number(contractRate||0),depositAmount:depositAmount?Number(depositAmount):null,paymentDay:paymentDay?Number(paymentDay):null,prepaidUntil:prepaidUntil||null,nextPaymentDue:nextPaymentDue||null,noticeDays:noticeDays?Number(noticeDays):null,autoRenew:false});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать договор");}finally{setBusy(false)}}
  async function recordPayment(){if(!paymentContract)return;setBusy(true);setError("");try{await post("/api/housing/contracts",{action:"record_payment",id:paymentContract.id,amount:Number(paymentAmount),paymentDate,prepaidUntil:paymentPrepaidUntil||null,nextPaymentDue:paymentNextDue||null},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось зафиксировать оплату");}finally{setBusy(false)}}

  return <div className="housing-portfolio-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Забронировано мест</span><strong>{reserved}</strong><small>по действующим договорам</small></div>
      <div className="metric"><span>Проживает</span><strong>{occupied}</strong><small>активные заселения</small></div>
      <div className={"metric "+(freeReserved?"tone-good":"tone-warn")}><span>Свободно для нас</span><strong>{freeReserved}</strong><small>в оплаченной / забронированной квоте</small></div>
      <div className={"metric "+(attentionCount?"tone-warn":"tone-good")}><span>Требует внимания</span><strong>{attentionCount}</strong><small>{rub(forecast)} прогноз / мес</small></div>
    </div>
    <div className="object-local-tabs supply-portfolio-tabs" role="tablist" aria-label="Жильё">
      <button className={view==="housing"?"active":""} onClick={()=>setView("housing")}>Жильё <span>{visibleSites.length}</span></button>
      <button className={view==="stays"?"active":""} onClick={()=>setView("stays")}>Заселения <span>{visibleStays.length}</span></button>
      <button className={view==="contracts"?"active":""} onClick={()=>setView("contracts")}>Договоры и оплаты <span>{visibleContracts.length}</span></button>
      <button className={view==="attention"?"active":""} onClick={()=>setView("attention")}>Требует внимания <span>{attentionCount}</span></button>
    </div>
    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar">
      <div className="personnel-portfolio-filters"><SalesSearch value={query} onChange={setQuery} placeholder="Жильё, объект, подрядчик, договор"/><select value={manager} onChange={e=>{setManager(e.target.value);setObjectId("all")}}><option value="all">Все менеджеры</option>{managers.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="all">Все объекты</option>{visibleObjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      {canManage&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>setShowStay(true)}><UserPlus size={14}/> Заселить</button><button className="button" onClick={()=>setShowContract(true)}><Plus size={14}/> Договор</button><button className="button primary" onClick={()=>setShowSite(true)}><Plus size={14}/> Добавить жильё</button></div>}
    </div>

    {view==="housing"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table housing-portfolio-table"><thead><tr><th>Жильё</th><th>Менеджер</th><th>Объект</th><th>Условия</th><th>Вместимость</th><th>Забронировано</th><th>Занято</th><th>Свободно для нас</th><th>Следующая оплата</th><th>Состояние</th></tr></thead><tbody>
      {visibleSites.map(row=>{const contract=contractBySite.get(row.id);const booked=contract?.bookedCapacity??row.capacity;const free=Math.max(0,booked-row.occupied);const object=row.objectId?objectMap.get(row.objectId):null;return <tr key={row.id} className={free<=0&&booked>0?"row-attention":""}><td><strong className="cell-title">{row.name}</strong><span className="cell-sub">{row.address??row.vendor??"Адрес не указан"}</span></td><td>{object?.ownerName??row.responsible??"—"}</td><td>{row.object??"Без объекта"}</td><td>{contract?rateLabels[contract.billingModel]??contract.billingModel:rateLabels[row.rateModel]??row.rateModel}<span className="cell-sub">{rub(contract?.rateAmount??row.rateAmount)}</span></td><td className="num">{row.capacity}</td><td className="num">{booked}</td><td className="num">{row.occupied}</td><td><Status tone={free>0?"good":"warn"}>{free}</Status></td><td>{contract?.nextPaymentDue??"—"}{contract?.prepaidUntil&&<span className="cell-sub">оплачено до {contract.prepaidUntil}</span>}</td><td><Status tone={!contract?"warn":contractAttention(contract)?"warn":"good"}>{!contract?"Нет договора":contractAttention(contract)?"Проверить":"Под контролем"}</Status></td></tr>})}
    </tbody></table>{!visibleSites.length&&<div className="empty-inline">Жильё по выбранным фильтрам не найдено.</div>}</div></section>}

    {view==="stays"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th><th>Менеджер</th><th>Объект</th><th>Жильё</th><th>Комната / место</th><th>Заезд</th><th>Выезд</th><th>Статус</th></tr></thead><tbody>{visibleStays.map(row=>{const object=row.objectId?objectMap.get(row.objectId):null;return <tr key={row.id}><td className="cell-title">{row.worker}</td><td>{object?.ownerName??"—"}</td><td>{row.object??"—"}</td><td>{row.site}</td><td>{row.unit??"—"}{row.bedLabel&&<span className="cell-sub">место {row.bedLabel}</span>}</td><td>{row.checkIn}</td><td>{row.checkOut??"—"}</td><td><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></td></tr>})}</tbody></table>{!visibleStays.length&&<div className="empty-inline">Активных и плановых заселений нет.</div>}</div></section>}

    {view==="contracts"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table housing-contracts-table"><thead><tr><th>Жильё / договор</th><th>Менеджер</th><th>Подрядчик</th><th>Подписание</th><th>Период</th><th>Условия</th><th>Забронировано</th><th>Оплачено до</th><th>Следующая оплата</th><th>Последняя оплата</th><th></th></tr></thead><tbody>{visibleContracts.map(row=><tr key={row.id} className={contractAttention(row)?"row-attention":""}><td><strong className="cell-title">{row.site}</strong><span className="cell-sub">{row.contractNumber?"№ "+row.contractNumber:"Без номера"}</span></td><td>{row.manager??"—"}</td><td>{row.partner??"—"}</td><td><Status tone={row.signedOn?"good":"warn"}>{row.signedOn?"Подписан":"Не подписан"}</Status>{row.signedOn&&<span className="cell-sub">{row.signedOn}</span>}</td><td>{row.validFrom} — {row.validTo??"бессрочно"}</td><td>{rateLabels[row.billingModel]??row.billingModel}<span className="cell-sub">{rub(row.rateAmount)}{row.depositAmount!=null?" · депозит "+rub(row.depositAmount):""}</span></td><td className="num">{row.bookedCapacity??"—"}</td><td>{row.prepaidUntil??"—"}</td><td>{row.nextPaymentDue??"—"}{row.paymentDay&&<span className="cell-sub">платёжный день: {row.paymentDay}</span>}</td><td>{row.lastPaymentAmount!=null?rub(row.lastPaymentAmount):"—"}{row.lastPaymentDate&&<span className="cell-sub">{row.lastPaymentDate}</span>}</td><td>{canManage&&<button className="button" onClick={()=>{setPaymentContract(row);setPaymentAmount(String(row.rateAmount));setPaymentPrepaidUntil("");setPaymentNextDue("")}}>Оплата</button>}</td></tr>)}</tbody></table>{!visibleContracts.length&&<div className="empty-inline">Договоры жилья ещё не заведены.</div>}</div></section>}

    {view==="attention"&&<section className="section"><div className="stack-list">{fullSites.map(row=><div className="stack-item" key={"site-"+row.id}><div><strong>{row.name} · нет свободных забронированных мест</strong><small>{row.occupied} проживает, забронировано {contractBySite.get(row.id)?.bookedCapacity??row.capacity}</small></div><Status tone="warn">Заполнено</Status></div>)}{attentionContracts.map(row=><div className="stack-item" key={"contract-"+row.id}><div><strong>{row.site} · договор / оплата</strong><small>{!row.signedOn?"договор не отмечен как подписанный":row.nextPaymentDue?"следующая оплата "+row.nextPaymentDue:"проверьте срок договора"}{row.prepaidUntil?" · оплачено до "+row.prepaidUntil:""}</small></div><Status tone="warn">Проверить</Status></div>)}</div>{!attentionCount&&<div className="empty-inline">По жилью нет текущих сигналов.</div>}</section>}

    {showSite&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowSite(false)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Новое жильё</h2><p>Общежитие, квартира или другой объект проживания.</p></div><button className="icon-button" onClick={()=>setShowSite(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Название<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Адрес<input value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Поставщик / арендодатель<input value={vendor} onChange={e=>setVendor(e.target.value)}/></label><label>Основной объект<select value={formObjectId} onChange={e=>setFormObjectId(e.target.value)}>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Базовый тариф<select value={rateModel} onChange={e=>setRateModel(e.target.value as typeof rateModel)}>{Object.entries(rateLabels).filter(([value])=>value!=="bed_month").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Стоимость<input type="number" min="0" value={rateAmount} onChange={e=>setRateAmount(e.target.value)}/></label><label>Комната / блок<input value={unitName} onChange={e=>setUnitName(e.target.value)}/></label><label>Мест<input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowSite(false)}>Отмена</button><button className="button primary" disabled={busy||!name||!formObjectId} onClick={()=>void createSite()}>{busy?"Сохраняю…":"Создать"}</button></div></div></div></Portal>}

    {showStay&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowStay(false)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Заселение сотрудника</h2><p>Период проживания сохраняется в истории сотрудника и объекта.</p></div><button className="icon-button" onClick={()=>setShowStay(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Сотрудник<select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(x=><option key={x.id} value={x.id}>{x.fullName}{x.object?" · "+x.object:""}</option>)}</select></label><label>Жильё<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Выберите</option>{snapshot.sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Место / кровать<input value={bedLabel} onChange={e=>setBedLabel(e.target.value)}/></label><label>Заезд<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Плановый выезд<input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowStay(false)}>Отмена</button><button className="button primary" disabled={busy||!workerId||!siteId} onClick={()=>void createStay()}>{busy?"Сохраняю…":"Заселить"}</button></div></div></div></Portal>}

    {showContract&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowContract(false)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Договор по жилью</h2><p>Фиксируем бронирование, тариф, срок договора и график оплат.</p></div><button className="icon-button" onClick={()=>setShowContract(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Жильё<select value={contractSiteId} onChange={e=>setContractSiteId(e.target.value)}>{snapshot.sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Подрядчик<select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не указан</option>{partners.filter(row=>row.categories.includes("housing")).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Номер договора<input value={contractNumber} onChange={e=>setContractNumber(e.target.value)}/></label><label>Дата подписания<input type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)}/></label><label>Действует с<input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label><label>Действует до<input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)}/></label><label>Модель оплаты<select value={billingModel} onChange={e=>setBillingModel(e.target.value)}>{Object.entries(rateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Забронировано мест<input type="number" min="0" value={bookedCapacity} onChange={e=>setBookedCapacity(e.target.value)}/></label><label>Тариф<input type="number" min="0" value={contractRate} onChange={e=>setContractRate(e.target.value)}/></label><label>Депозит<input type="number" min="0" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)}/></label><label>Платёжный день<input type="number" min="1" max="31" value={paymentDay} onChange={e=>setPaymentDay(e.target.value)}/></label><label>Оплачено до<input type="date" value={prepaidUntil} onChange={e=>setPrepaidUntil(e.target.value)}/></label><label>Следующая оплата<input type="date" value={nextPaymentDue} onChange={e=>setNextPaymentDue(e.target.value)}/></label><label>Уведомление о расторжении, дней<input type="number" min="0" value={noticeDays} onChange={e=>setNoticeDays(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowContract(false)}>Отмена</button><button className="button primary" disabled={busy||!contractSiteId||!validFrom||!contractRate} onClick={()=>void createContract()}>{busy?"Сохраняю…":"Создать договор"}</button></div></div></div></Portal>}

    {paymentContract&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setPaymentContract(null)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Оплата жилья</h2><p>{paymentContract.site}{paymentContract.contractNumber?" · договор № "+paymentContract.contractNumber:""}. После сохранения расход попадёт в экономику объекта.</p></div><button className="icon-button" onClick={()=>setPaymentContract(null)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Сумма<input type="number" min="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label>Дата оплаты<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label>Оплачено до<input type="date" value={paymentPrepaidUntil} onChange={e=>setPaymentPrepaidUntil(e.target.value)}/></label><label>Следующая оплата<input type="date" value={paymentNextDue} onChange={e=>setPaymentNextDue(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setPaymentContract(null)}>Отмена</button><button className="button primary" disabled={busy||!paymentAmount||!paymentDate} onClick={()=>void recordPayment()}>{busy?"Сохраняю…":"Зафиксировать оплату"}</button></div></div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
