"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { OperationsReferenceData } from "@/lib/operations/service";
import type { HousingContractRow, SupplyPartnerRow } from "@/lib/operations/supply-control";
import type { HousingControlSiteRow, HousingControlSnapshot, HousingControlStayRow } from "@/lib/operations/housing-control";
import { rub } from "@/lib/ui/format";

type View="housing"|"stays"|"contracts"|"attention";
type StayAction="plan_checkout"|"confirm_checkin"|"confirm_checkout"|"cancel";

const rateLabels:Record<string,string>={bed_day:"Койко-место / сутки",bed_month:"Койко-место / месяц",room_day:"Комната / сутки",room_month:"Комната / месяц",site_period:"Фиксировано / период"};
const siteTypeLabels:Record<string,string>={dormitory:"Общежитие",hostel:"Хостел",apartment:"Квартира",hotel:"Гостиница",company_housing:"Служебное жильё",other:"Другое"};
const stayStatusLabels:Record<string,string>={planned:"Запланировано",active:"Проживает",completed:"Выселен",cancelled:"Отменено"};

function ruToIso(value:string|null){if(!value)return null;const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+"-"+m[2]+"-"+m[1]:null}
function dueSoon(contract:HousingContractRow){
  const due=ruToIso(contract.nextPaymentDue);if(!due||!contract.active)return false;
  const future=new Date();future.setUTCDate(future.getUTCDate()+14);
  return due<=future.toISOString().slice(0,10);
}
function contractAttention(contract:HousingContractRow){
  const today=new Date().toISOString().slice(0,10),due=ruToIso(contract.nextPaymentDue),validTo=ruToIso(contract.validTo);
  return Boolean(!contract.signedOn||(due&&due<today)||(validTo&&validTo<=today)||dueSoon(contract));
}
function stayNeedsAttention(row:HousingControlStayRow){
  return Boolean(row.status==="active"&&row.exitProcessId&&!row.actualCheckOut&&(!row.plannedCheckOut||row.exitStatus==="completed"));
}

export function HousingPortfolioWorkspace({snapshot,options,contracts,partners,canManage,demo,initialWorkerId}:{snapshot:HousingControlSnapshot;options:OperationsReferenceData;contracts:HousingContractRow[];partners:SupplyPartnerRow[];canManage:boolean;demo:boolean;initialWorkerId?:string|null}){
  const [view,setView]=useState<View>("housing");
  const [query,setQuery]=useState("");
  const [manager,setManager]=useState("all");
  const [objectId,setObjectId]=useState("all");

  const [showSite,setShowSite]=useState(false);
  const [showStay,setShowStay]=useState(Boolean(initialWorkerId)&&canManage);
  const [showContract,setShowContract]=useState(false);
  const [paymentContract,setPaymentContract]=useState<HousingContractRow|null>(null);
  const [stayAction,setStayAction]=useState<{row:HousingControlStayRow;action:StayAction}|null>(null);

  const [name,setName]=useState("");
  const [siteType,setSiteType]=useState("dormitory");
  const [address,setAddress]=useState("");
  const [partnerId,setPartnerId]=useState("");
  const [formObjectIds,setFormObjectIds]=useState<string[]>(options.objects[0]?.id?[options.objects[0].id]:[]);
  const [contactName,setContactName]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [rateModel,setRateModel]=useState<"bed_day"|"room_day"|"room_month"|"site_period">("bed_day");
  const [rateAmount,setRateAmount]=useState("");
  const [unitName,setUnitName]=useState("Комната 1");
  const [capacity,setCapacity]=useState("1");

  const [workerId,setWorkerId]=useState(initialWorkerId??"");
  const [siteId,setSiteId]=useState(snapshot.sites[0]?.id??"");
  const [stayUnitId,setStayUnitId]=useState("");
  const [bedLabel,setBedLabel]=useState("");
  const [checkIn,setCheckIn]=useState(new Date().toISOString().slice(0,10));
  const [plannedCheckOut,setPlannedCheckOut]=useState("");

  const [contractSiteId,setContractSiteId]=useState(snapshot.sites[0]?.id??"");
  const [contractPartnerId,setContractPartnerId]=useState("");
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
  const [paymentObjectId,setPaymentObjectId]=useState("");

  const [stayActionDate,setStayActionDate]=useState("");
  const [stayActionNote,setStayActionNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const contractBySite=useMemo(()=>new Map(contracts.filter(row=>row.active).map(row=>[row.siteId,row])),[contracts]);
  const managers=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const visibleObjects=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);

  const visibleSites=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return snapshot.sites.filter(row=>{
      if(manager!=="all"&&!row.objectLinks.some(link=>(link.managerId??"unassigned")===manager))return false;
      if(objectId!=="all"&&!row.objectLinks.some(link=>link.objectId===objectId))return false;
      const contract=contractBySite.get(row.id);
      const text=[row.name,row.address,row.vendor,row.partner,row.contactName,row.contactPhone,row.responsible,...row.objectLinks.map(link=>link.object),contract?.contractNumber].filter(Boolean).join(" ").toLocaleLowerCase("ru");
      return !needle||text.includes(needle);
    });
  },[snapshot.sites,query,manager,objectId,contractBySite]);
  const visibleSiteIds=useMemo(()=>new Set(visibleSites.map(row=>row.id)),[visibleSites]);
  const visibleStays=useMemo(()=>snapshot.stays.filter(row=>visibleSiteIds.has(row.siteId)),[snapshot.stays,visibleSiteIds]);
  const visibleContracts=useMemo(()=>contracts.filter(row=>visibleSiteIds.has(row.siteId)),[contracts,visibleSiteIds]);

  function siteState(site:HousingControlSiteRow){
    const contract=contractBySite.get(site.id);
    const booked=contract?.bookedCapacity??site.capacity;
    const free=booked-site.projectedOccupied;
    const stayAttention=snapshot.stays.some(row=>row.siteId===site.id&&stayNeedsAttention(row));
    if(free<0)return {tone:"bad" as const,label:"Не хватает мест"};
    if(stayAttention||!contract||contractAttention(contract))return {tone:"warn" as const,label:"Проверить"};
    if(free===0)return {tone:"warn" as const,label:"Заполнено"};
    return {tone:"good" as const,label:"Под контролем"};
  }

  const attentionSites=visibleSites.filter(site=>siteState(site).tone!=="good");
  const reserved=visibleSites.reduce((sum,row)=>sum+(contractBySite.get(row.id)?.bookedCapacity??row.capacity),0);
  const occupied=visibleSites.reduce((sum,row)=>sum+row.occupied,0);
  const projectedFree=visibleSites.reduce((sum,row)=>sum+(contractBySite.get(row.id)?.bookedCapacity??row.capacity)-row.projectedOccupied,0);

  async function post(url:string,body:unknown,method="POST"){
    if(demo){setError("Изменения в демо-режиме недоступны");return false;}
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");
    window.location.reload();return true;
  }

  function toggleObject(id:string){setFormObjectIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
  async function createSite(){setBusy(true);setError("");try{await post("/api/housing/sites",{name,siteType,address:address||null,partnerId:partnerId||null,vendor:null,objectIds:formObjectIds,contactName:contactName||null,contactPhone:contactPhone||null,rateModel,rateAmount:Number(rateAmount||0),unitName,capacity:Number(capacity)});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать жильё");}finally{setBusy(false)}}
  async function createStay(){setBusy(true);setError("");try{await post("/api/housing/stays",{workerId,siteId,unitId:stayUnitId||null,bedLabel:bedLabel||null,checkIn,plannedCheckOut:plannedCheckOut||null});}catch(e){setError(e instanceof Error?e.message:"Не удалось заселить сотрудника");}finally{setBusy(false)}}
  async function createContract(){setBusy(true);setError("");try{await post("/api/housing/contracts",{siteId:contractSiteId,partnerId:contractPartnerId||null,contractNumber:contractNumber||null,signedOn:signedOn||null,validFrom,validTo:validTo||null,billingModel,bookedCapacity:bookedCapacity?Number(bookedCapacity):null,rateAmount:Number(contractRate||0),depositAmount:depositAmount?Number(depositAmount):null,paymentDay:paymentDay?Number(paymentDay):null,prepaidUntil:prepaidUntil||null,nextPaymentDue:nextPaymentDue||null,noticeDays:noticeDays?Number(noticeDays):null,autoRenew:false});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать договор");}finally{setBusy(false)}}
  async function recordPayment(){if(!paymentContract)return;setBusy(true);setError("");try{await post("/api/housing/contracts",{action:"record_payment",id:paymentContract.id,amount:Number(paymentAmount),paymentDate,prepaidUntil:paymentPrepaidUntil||null,nextPaymentDue:paymentNextDue||null,objectId:paymentObjectId||null},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось зафиксировать оплату");}finally{setBusy(false)}}
  async function applyStayAction(){
    if(!stayAction)return;setBusy(true);setError("");
    try{
      const body=stayAction.action==="plan_checkout"?{action:stayAction.action,id:stayAction.row.id,plannedCheckOut:stayActionDate,note:stayActionNote||null}:
        stayAction.action==="confirm_checkin"?{action:stayAction.action,id:stayAction.row.id,actualCheckIn:stayActionDate}:
        stayAction.action==="confirm_checkout"?{action:stayAction.action,id:stayAction.row.id,actualCheckOut:stayActionDate,note:stayActionNote||null}:
        {action:stayAction.action,id:stayAction.row.id,note:stayActionNote||null};
      await post("/api/housing/stays",body,"PATCH");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить проживание");}finally{setBusy(false)}
  }
  function openStayAction(row:HousingControlStayRow,action:StayAction){
    setStayAction({row,action});setStayActionNote("");
    const today=new Date().toISOString().slice(0,10);
    setStayActionDate(action==="plan_checkout"?(ruToIso(row.plannedCheckOut)??ruToIso(row.exitDate)??today):today);
  }
  function openPayment(contract:HousingContractRow,site:HousingControlSiteRow){
    setPaymentContract(contract);setPaymentAmount(String(contract.rateAmount));setPaymentPrepaidUntil("");setPaymentNextDue("");
    setPaymentObjectId(site.objectLinks[0]?.objectId??"");
  }

  return <div className="housing-portfolio-workspace">
    <div className="metrics-grid supply-portfolio-metrics housing-portfolio-summary">
      <div className="metric"><span>Забронировано мест</span><strong>{reserved}</strong><small>по действующим условиям</small></div>
      <div className="metric"><span>Проживает</span><strong>{occupied}</strong><small>фактически подтверждено</small></div>
      <div className="metric"><span>Свободно после планов</span><strong>{projectedFree}</strong><small>заезды и выселения учтены</small></div>
      <div className="metric"><span>Требует внимания</span><strong>{attentionSites.length}</strong><small>договоры, места и выселения</small></div>
    </div>

    <div className="object-local-tabs supply-portfolio-tabs" role="tablist" aria-label="Жильё">
      <button className={view==="housing"?"active":""} onClick={()=>setView("housing")}>Жильё <span>{visibleSites.length}</span></button>
      <button className={view==="stays"?"active":""} onClick={()=>setView("stays")}>Заселения <span>{visibleStays.filter(row=>["planned","active"].includes(row.status)).length}</span></button>
      <button className={view==="contracts"?"active":""} onClick={()=>setView("contracts")}>Договоры и оплаты <span>{visibleContracts.length}</span></button>
      <button className={view==="attention"?"active":""} onClick={()=>setView("attention")}>Требует внимания <span>{attentionSites.length}</span></button>
    </div>

    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar housing-portfolio-toolbar">
      <div className="personnel-portfolio-filters">
        <SalesSearch value={query} onChange={setQuery} placeholder="Жильё, объект, подрядчик, контакт"/>
        <select value={manager} onChange={e=>{setManager(e.target.value);setObjectId("all")}}><option value="all">Все менеджеры</option>{managers.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        <select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="all">Все объекты</option>{visibleObjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
      </div>
      {canManage&&view==="housing"&&<button className="button primary" onClick={()=>setShowSite(true)}><Plus size={14}/> Добавить жильё</button>}
      {canManage&&view==="stays"&&<button className="button primary" onClick={()=>setShowStay(true)}><UserPlus size={14}/> Заселить</button>}
      {canManage&&view==="contracts"&&<button className="button primary" onClick={()=>setShowContract(true)}><Plus size={14}/> Добавить договор</button>}
    </div>

    {view==="housing"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table housing-registry-table">
      <thead><tr><th>Жильё</th><th>Менеджер</th><th>Объекты</th><th>Условия</th><th>Наша квота</th><th>Проживает</th><th>Заедет</th><th>Выселится</th><th>Свободно после планов</th><th>Состояние</th></tr></thead>
      <tbody>{visibleSites.map(site=>{
        const contract=contractBySite.get(site.id);const booked=contract?.bookedCapacity??site.capacity;const free=booked-site.projectedOccupied;const state=siteState(site);
        return <tr key={site.id} className={state.tone==="bad"?"row-attention":""}>
          <td><Link className="housing-site-link" href={"/supply/housing/"+site.id}><strong>{site.name}</strong><span>{site.address??siteTypeLabels[site.siteType]??"Жильё"}</span></Link></td>
          <td>{site.responsible??site.objectLinks[0]?.manager??"—"}</td>
          <td><div className="housing-object-list">{site.objectLinks.slice(0,2).map(link=><span key={link.objectId}>{link.object}</span>)}{site.objectLinks.length>2&&<small>ещё {site.objectLinks.length-2}</small>}</div></td>
          <td>{contract?rateLabels[contract.billingModel]??contract.billingModel:"Договор не задан"}{contract&&<span className="cell-sub">{rub(contract.rateAmount)}</span>}</td>
          <td className="num">{booked}</td><td className="num">{site.occupied}</td><td className="num">{site.plannedArrivals}</td><td className="num">{site.plannedDepartures}</td>
          <td><Status tone={free<0?"bad":free===0?"warn":"good"}>{free}</Status></td><td><Status tone={state.tone}>{state.label}</Status></td>
        </tr>;
      })}</tbody>
    </table>{!visibleSites.length&&<div className="empty-inline">Жильё по выбранным фильтрам не найдено.</div>}</div></section>}

    {view==="stays"&&<section className="section section-flush"><StayTable rows={visibleStays} canManage={canManage} onAction={openStayAction}/></section>}

    {view==="contracts"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table housing-contracts-table"><thead><tr><th>Жильё / подрядчик</th><th>Договор</th><th>Условия</th><th>Квота</th><th>Оплата</th><th>Последняя оплата</th>{canManage&&<th></th>}</tr></thead><tbody>
      {visibleContracts.map(row=>{const site=snapshot.sites.find(item=>item.id===row.siteId);return <tr key={row.id} className={contractAttention(row)?"row-attention":""}>
        <td><Link className="housing-site-link" href={"/supply/housing/"+row.siteId+"?tab=contract"}><strong>{row.site}</strong><span>{row.partner??"Подрядчик не указан"}</span></Link></td>
        <td><Status tone={row.signedOn?"good":"warn"}>{row.signedOn?"Подписан":"Не подписан"}</Status><span className="cell-sub">{row.contractNumber?"№ "+row.contractNumber:"Без номера"} · {row.validFrom} — {row.validTo??"бессрочно"}</span></td>
        <td>{rateLabels[row.billingModel]??row.billingModel}<span className="cell-sub">{rub(row.rateAmount)}{row.depositAmount!=null?" · депозит "+rub(row.depositAmount):""}</span></td>
        <td className="num">{row.bookedCapacity??"—"}</td>
        <td><strong>{row.prepaidUntil??"—"}</strong><span className="cell-sub">следующая: {row.nextPaymentDue??"—"}</span></td>
        <td>{row.lastPaymentAmount!=null?rub(row.lastPaymentAmount):"—"}{row.lastPaymentDate&&<span className="cell-sub">{row.lastPaymentDate}</span>}</td>
        {canManage&&<td>{site&&<button className="table-link" onClick={()=>openPayment(row,site)}>Оплата</button>}</td>}
      </tr>})}
      </tbody></table>{!visibleContracts.length&&<div className="empty-inline">Договоры жилья ещё не заведены.</div>}</div></section>}

    {view==="attention"&&<section className="section"><div className="stack-list">
      {attentionSites.map(site=>{const contract=contractBySite.get(site.id);const booked=contract?.bookedCapacity??site.capacity;const free=booked-site.projectedOccupied;const problemStay=snapshot.stays.find(row=>row.siteId===site.id&&stayNeedsAttention(row));return <Link className="stack-item housing-attention-item" href={"/supply/housing/"+site.id} key={site.id}><div><strong>{site.name}</strong><small>{free<0?"После плановых движений не хватает "+Math.abs(free)+" мест":problemStay?problemStay.worker+" — увольнение связано с проживанием, выселение не закрыто":!contract?"Не заведен действующий договор":contractAttention(contract)?(!contract.signedOn?"Договор не отмечен как подписанный":"Проверьте срок договора или оплату"):"Проверьте жильё"}</small></div><Status tone={free<0?"bad":"warn"}>Проверить</Status></Link>})}
    </div>{!attentionSites.length&&<div className="empty-inline">По жилью нет текущих сигналов.</div>}</section>}

    {showSite&&<SimpleModal title="Новое жильё" text="Создайте объект проживания и сразу укажите, какие объекты компании его используют." onClose={()=>setShowSite(false)} footer={<><button className="button" onClick={()=>setShowSite(false)}>Отмена</button><button className="button primary" disabled={busy||!name||!formObjectIds.length} onClick={()=>void createSite()}>Создать</button></>}>
      <div className="form-grid two"><label className="span-2"><span>Название</span><input value={name} onChange={e=>setName(e.target.value)}/></label><label><span>Тип</span><select value={siteType} onChange={e=>setSiteType(e.target.value)}>{Object.entries(siteTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Подрядчик</span><select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не выбран</option>{partners.filter(row=>row.categories.includes("housing")).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="span-2"><span>Адрес</span><input value={address} onChange={e=>setAddress(e.target.value)}/></label><label><span>Контакт</span><input value={contactName} onChange={e=>setContactName(e.target.value)}/></label><label><span>Телефон</span><input value={contactPhone} onChange={e=>setContactPhone(e.target.value)}/></label><label className="span-2"><span>Объекты</span><div className="housing-object-picker">{options.objects.map(object=><label key={object.id}><input type="checkbox" checked={formObjectIds.includes(object.id)} onChange={()=>toggleObject(object.id)}/>{object.name}</label>)}</div></label><label><span>Базовая модель</span><select value={rateModel} onChange={e=>setRateModel(e.target.value as typeof rateModel)}>{Object.entries(rateLabels).filter(([value])=>value!=="bed_month").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Базовая стоимость</span><input type="number" min="0" value={rateAmount} onChange={e=>setRateAmount(e.target.value)}/></label><label><span>Первая комната / блок</span><input value={unitName} onChange={e=>setUnitName(e.target.value)}/></label><label><span>Мест</span><input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {showStay&&<SimpleModal title="Заселение сотрудника" text="Плановая дата выезда не освобождает место фактически — выселение подтверждается отдельно." onClose={()=>setShowStay(false)} footer={<><button className="button" onClick={()=>setShowStay(false)}>Отмена</button><button className="button primary" disabled={busy||!workerId||!siteId} onClick={()=>void createStay()}>Сохранить</button></>}>
      <div className="form-grid two"><label><span>Сотрудник</span><select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(row=><option key={row.id} value={row.id}>{row.fullName}{row.object?" · "+row.object:""}</option>)}</select></label><label><span>Жильё</span><select value={siteId} onChange={e=>{setSiteId(e.target.value);setStayUnitId("")}}><option value="">Выберите</option>{snapshot.sites.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Комната / блок</span><select value={stayUnitId} onChange={e=>setStayUnitId(e.target.value)}><option value="">Не указано</option>{snapshot.units.filter(row=>row.siteId===siteId&&row.active).map(row=><option key={row.id} value={row.id}>{row.name} · {row.occupied}/{row.capacity}</option>)}</select></label><label><span>Место</span><input value={bedLabel} onChange={e=>setBedLabel(e.target.value)}/></label><label><span>Заезд</span><input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label><span>Плановый выезд</span><input type="date" value={plannedCheckOut} onChange={e=>setPlannedCheckOut(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {showContract&&<SimpleModal title="Договор по жилью" text="Фиксируем договорную квоту, тариф, депозит и календарь оплат." onClose={()=>setShowContract(false)} footer={<><button className="button" onClick={()=>setShowContract(false)}>Отмена</button><button className="button primary" disabled={busy||!contractSiteId||!validFrom||!contractRate} onClick={()=>void createContract()}>Создать договор</button></>}>
      <div className="form-grid two"><label><span>Жильё</span><select value={contractSiteId} onChange={e=>setContractSiteId(e.target.value)}>{snapshot.sites.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Подрядчик</span><select value={contractPartnerId} onChange={e=>setContractPartnerId(e.target.value)}><option value="">Не указан</option>{partners.filter(row=>row.categories.includes("housing")).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Номер договора</span><input value={contractNumber} onChange={e=>setContractNumber(e.target.value)}/></label><label><span>Дата подписания</span><input type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)}/></label><label><span>Действует с</span><input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label><label><span>Действует до</span><input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)}/></label><label><span>Модель оплаты</span><select value={billingModel} onChange={e=>setBillingModel(e.target.value)}>{Object.entries(rateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Забронировано мест</span><input type="number" min="0" value={bookedCapacity} onChange={e=>setBookedCapacity(e.target.value)}/></label><label><span>Тариф</span><input type="number" min="0" value={contractRate} onChange={e=>setContractRate(e.target.value)}/></label><label><span>Депозит</span><input type="number" min="0" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)}/></label><label><span>Платёжный день</span><input type="number" min="1" max="31" value={paymentDay} onChange={e=>setPaymentDay(e.target.value)}/></label><label><span>Оплачено до</span><input type="date" value={prepaidUntil} onChange={e=>setPrepaidUntil(e.target.value)}/></label><label><span>Следующая оплата</span><input type="date" value={nextPaymentDue} onChange={e=>setNextPaymentDue(e.target.value)}/></label><label><span>Уведомление, дней</span><input type="number" min="0" value={noticeDays} onChange={e=>setNoticeDays(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {paymentContract&&<SimpleModal title="Оплата жилья" text="Фактический расход попадёт в экономику выбранного связанного объекта." onClose={()=>setPaymentContract(null)} footer={<><button className="button" onClick={()=>setPaymentContract(null)}>Отмена</button><button className="button primary" disabled={busy||!paymentAmount||!paymentDate||!paymentObjectId} onClick={()=>void recordPayment()}>Зафиксировать оплату</button></>}>
      <div className="form-grid two"><label><span>Объект затрат</span><select value={paymentObjectId} onChange={e=>setPaymentObjectId(e.target.value)}>{(snapshot.sites.find(row=>row.id===paymentContract.siteId)?.objectLinks??[]).map(link=><option key={link.objectId} value={link.objectId}>{link.object}</option>)}</select></label><label><span>Сумма</span><input type="number" min="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label><span>Дата оплаты</span><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label><span>Оплачено до</span><input type="date" value={paymentPrepaidUntil} onChange={e=>setPaymentPrepaidUntil(e.target.value)}/></label><label><span>Следующая оплата</span><input type="date" value={paymentNextDue} onChange={e=>setPaymentNextDue(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {stayAction&&<SimpleModal title={stayAction.action==="plan_checkout"?"Плановое выселение":stayAction.action==="confirm_checkin"?"Подтвердить заселение":stayAction.action==="confirm_checkout"?"Подтвердить выселение":"Отменить заселение"} text={stayAction.row.worker+" · "+stayAction.row.site} onClose={()=>setStayAction(null)} footer={<><button className="button" onClick={()=>setStayAction(null)}>Отмена</button><button className="button primary" disabled={busy||(stayAction.action!=="cancel"&&!stayActionDate)} onClick={()=>void applyStayAction()}>Сохранить</button></>}>
      {stayAction.action!=="cancel"&&<label><span>Дата</span><input type="date" value={stayActionDate} onChange={e=>setStayActionDate(e.target.value)}/></label>}<label><span>Комментарий</span><textarea value={stayActionNote} onChange={e=>setStayActionNote(e.target.value)}/></label>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}
  </div>;
}

function StayTable({rows,canManage,onAction}:{rows:HousingControlStayRow[];canManage:boolean;onAction:(row:HousingControlStayRow,action:StayAction)=>void}){
  return <div className="request-table-wrap"><table className="data-table housing-stays-table"><thead><tr><th>Сотрудник</th><th>Менеджер</th><th>Объект</th><th>Жильё / место</th><th>Заезд</th><th>Плановый выезд</th><th>Фактический выезд</th><th>Статус</th>{canManage&&<th>Действия</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={stayNeedsAttention(row)?"row-attention":""}><td><strong className="cell-title">{row.worker}</strong>{row.exitDate&&<span className="cell-sub">завершение работы {row.exitDate}</span>}</td><td>{row.manager??"—"}</td><td>{row.object??"—"}</td><td><Link href={"/supply/housing/"+row.siteId+"?tab=residents"}>{row.site}</Link><span className="cell-sub">{[row.unit,row.bedLabel&&"место "+row.bedLabel].filter(Boolean).join(" · ")||"место не уточнено"}</span></td><td>{row.actualCheckIn??row.checkIn}{row.status==="planned"&&<span className="cell-sub">план</span>}</td><td>{row.plannedCheckOut??"—"}</td><td>{row.actualCheckOut??"—"}</td><td><Status tone={stayNeedsAttention(row)?"warn":row.status==="active"?"good":row.status==="planned"?"info":"neutral"}>{stayNeedsAttention(row)?"Закрыть проживание":stayStatusLabels[row.status]??row.status}</Status></td>{canManage&&<td><div className="housing-row-actions">{row.status==="planned"&&<button className="table-link" onClick={()=>onAction(row,"confirm_checkin")}>Заселён</button>}{row.status==="active"&&<button className="table-link" onClick={()=>onAction(row,"plan_checkout")}>{row.plannedCheckOut?"Изменить выезд":"План выезда"}</button>}{row.status==="active"&&<button className="table-link" onClick={()=>onAction(row,"confirm_checkout")}>Выселен</button>}{row.status==="planned"&&<button className="table-link" onClick={()=>onAction(row,"cancel")}>Отменить</button>}</div></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty-inline">Заселений нет.</div>}</div>;
}

function SimpleModal({title,text,onClose,footer,children}:{title:string;text?:string;onClose:()=>void;footer:React.ReactNode;children:React.ReactNode}){return <Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>{title}</h2>{text&&<p>{text}</p>}</div><button className="icon-button" onClick={onClose}><X size={17}/></button></div><div className="candidate-import-body">{children}</div><div className="recruiting-modal-footer">{footer}</div></div></div></Portal>}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
