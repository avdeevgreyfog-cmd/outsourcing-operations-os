"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { EntityTabs, Status } from "@/components/UI";
import type { OperationsReferenceData } from "@/lib/operations/service";
import type { HousingContractRow, SupplyPartnerRow } from "@/lib/operations/supply-control";
import type { HousingControlSiteRow, HousingControlSnapshot, HousingControlStayRow } from "@/lib/operations/housing-control";
import { rub } from "@/lib/ui/format";

type DetailTab="overview"|"units"|"residents"|"contract"|"payments"|"documents"|"history";
type StayAction="plan_checkout"|"confirm_checkin"|"confirm_checkout"|"cancel";

const rateLabels:Record<string,string>={bed_day:"Койко-место / сутки",bed_month:"Койко-место / месяц",room_day:"Комната / сутки",room_month:"Комната / месяц",site_period:"Фиксировано / период"};
const siteTypeLabels:Record<string,string>={dormitory:"Общежитие",hostel:"Хостел",apartment:"Квартира",hotel:"Гостиница",company_housing:"Служебное жильё",other:"Другое"};
const documentLabels:Record<string,string>={contract:"Договор",additional_agreement:"Доп. соглашение",act:"Акт",invoice:"Счёт",rules:"Правила проживания",other:"Другое"};
const unitTypeLabels:Record<string,string>={room:"Комната",block:"Блок",floor:"Этаж",other:"Другое"};
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

export function HousingSiteWorkspace({site,snapshot,options,contracts,partners,tab,canManage,demo}:{site:HousingControlSiteRow;snapshot:HousingControlSnapshot;options:OperationsReferenceData;contracts:HousingContractRow[];partners:SupplyPartnerRow[];tab:DetailTab;canManage:boolean;demo:boolean}){
  const activeContract=contracts.find(row=>row.siteId===site.id&&row.active)??null;
  const units=useMemo(()=>snapshot.units.filter(row=>row.siteId===site.id),[snapshot.units,site.id]);
  const stays=useMemo(()=>snapshot.stays.filter(row=>row.siteId===site.id),[snapshot.stays,site.id]);
  const documents=useMemo(()=>snapshot.documents.filter(row=>row.siteId===site.id),[snapshot.documents,site.id]);
  const payments=useMemo(()=>snapshot.payments.filter(row=>row.siteId===site.id),[snapshot.payments,site.id]);
  const history=useMemo(()=>snapshot.history.filter(row=>row.siteId===site.id),[snapshot.history,site.id]);

  const booked=activeContract?.bookedCapacity??site.capacity;
  const freeNow=booked-site.occupied;
  const freeAfterPlans=booked-site.projectedOccupied;
  const attentionStays=stays.filter(stayNeedsAttention);
  const state=freeAfterPlans<0
    ?{tone:"bad" as const,label:"Не хватает мест"}
    :attentionStays.length||!activeContract||(activeContract&&contractAttention(activeContract))
      ?{tone:"warn" as const,label:"Требует внимания"}
      :freeAfterPlans===0
        ?{tone:"warn" as const,label:"Заполнено"}
        :{tone:"good" as const,label:"Под контролем"};

  const [edit,setEdit]=useState(false);
  const [showStay,setShowStay]=useState(false);
  const [showUnit,setShowUnit]=useState(false);
  const [showContract,setShowContract]=useState(false);
  const [showDocument,setShowDocument]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false);
  const [stayAction,setStayAction]=useState<{row:HousingControlStayRow;action:StayAction}|null>(null);

  const [name,setName]=useState(site.name);
  const [siteType,setSiteType]=useState(site.siteType);
  const [address,setAddress]=useState(site.address??"");
  const [partnerId,setPartnerId]=useState(site.partnerId??"");
  const [vendor,setVendor]=useState(site.vendor??"");
  const [formObjectIds,setFormObjectIds]=useState(site.objectLinks.map(link=>link.objectId));
  const [contactName,setContactName]=useState(site.contactName??"");
  const [contactPhone,setContactPhone]=useState(site.contactPhone??"");
  const [checkInRules,setCheckInRules]=useState(site.checkInRules??"");
  const [checkOutRules,setCheckOutRules]=useState(site.checkOutRules??"");
  const [siteNotes,setSiteNotes]=useState(site.notes??"");

  const [workerId,setWorkerId]=useState("");
  const [stayUnitId,setStayUnitId]=useState("");
  const [bedLabel,setBedLabel]=useState("");
  const [checkIn,setCheckIn]=useState(new Date().toISOString().slice(0,10));
  const [plannedCheckOut,setPlannedCheckOut]=useState("");

  const [newUnitName,setNewUnitName]=useState("");
  const [newUnitType,setNewUnitType]=useState("room");
  const [newUnitCapacity,setNewUnitCapacity]=useState("1");
  const [newUnitNotes,setNewUnitNotes]=useState("");

  const [contractPartnerId,setContractPartnerId]=useState(activeContract?.partnerId??site.partnerId??"");
  const [contractNumber,setContractNumber]=useState("");
  const [signedOn,setSignedOn]=useState("");
  const [validFrom,setValidFrom]=useState(new Date().toISOString().slice(0,10));
  const [validTo,setValidTo]=useState("");
  const [billingModel,setBillingModel]=useState(activeContract?.billingModel??"bed_month");
  const [bookedCapacity,setBookedCapacity]=useState(activeContract?.bookedCapacity==null?"":String(activeContract.bookedCapacity));
  const [contractRate,setContractRate]=useState(activeContract?String(activeContract.rateAmount):"");
  const [depositAmount,setDepositAmount]=useState(activeContract?.depositAmount==null?"":String(activeContract.depositAmount));
  const [paymentDay,setPaymentDay]=useState(activeContract?.paymentDay==null?"":String(activeContract.paymentDay));
  const [prepaidUntil,setPrepaidUntil]=useState("");
  const [nextPaymentDue,setNextPaymentDue]=useState("");
  const [noticeDays,setNoticeDays]=useState(activeContract?.noticeDays==null?"":String(activeContract.noticeDays));

  const [paymentAmount,setPaymentAmount]=useState(activeContract?String(activeContract.rateAmount):"");
  const [paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));
  const [paymentPrepaidUntil,setPaymentPrepaidUntil]=useState("");
  const [paymentNextDue,setPaymentNextDue]=useState("");
  const [paymentObjectId,setPaymentObjectId]=useState(site.objectLinks[0]?.objectId??"");

  const [documentName,setDocumentName]=useState("");
  const [documentCategory,setDocumentCategory]=useState("contract");
  const [documentNumber,setDocumentNumber]=useState("");
  const [documentDate,setDocumentDate]=useState("");
  const [documentUrl,setDocumentUrl]=useState("");
  const [documentExpiresAt,setDocumentExpiresAt]=useState("");

  const [stayActionDate,setStayActionDate]=useState("");
  const [stayActionNote,setStayActionNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const tabs=[
    {label:"Обзор",href:"/supply/housing/"+site.id+"?tab=overview"},
    {label:"Места",href:"/supply/housing/"+site.id+"?tab=units",count:units.filter(row=>row.active).length},
    {label:"Проживающие",href:"/supply/housing/"+site.id+"?tab=residents",count:stays.filter(row=>["planned","active"].includes(row.status)).length},
    {label:"Договор",href:"/supply/housing/"+site.id+"?tab=contract"},
    {label:"Оплаты",href:"/supply/housing/"+site.id+"?tab=payments",count:payments.length},
    {label:"Документы",href:"/supply/housing/"+site.id+"?tab=documents",count:documents.length},
    {label:"История",href:"/supply/housing/"+site.id+"?tab=history"},
  ];

  async function post(url:string,body:unknown,method="POST"){
    if(demo){setError("Изменения в демо-режиме недоступны");return false;}
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");
    window.location.reload();return true;
  }
  function toggleObject(id:string){setFormObjectIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
  async function saveSite(){setBusy(true);setError("");try{await post("/api/housing/sites/"+site.id,{name,siteType,address:address||null,partnerId:partnerId||null,vendor:vendor||null,objectIds:formObjectIds,contactName:contactName||null,contactPhone:contactPhone||null,checkInRules:checkInRules||null,checkOutRules:checkOutRules||null,notes:siteNotes||null},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось обновить жильё");}finally{setBusy(false)}}
  async function createStay(){setBusy(true);setError("");try{await post("/api/housing/stays",{workerId,siteId:site.id,unitId:stayUnitId||null,bedLabel:bedLabel||null,checkIn,plannedCheckOut:plannedCheckOut||null});}catch(e){setError(e instanceof Error?e.message:"Не удалось заселить сотрудника");}finally{setBusy(false)}}
  async function createUnit(){setBusy(true);setError("");try{await post("/api/housing/units",{siteId:site.id,name:newUnitName,unitType:newUnitType,capacity:Number(newUnitCapacity),notes:newUnitNotes||null});}catch(e){setError(e instanceof Error?e.message:"Не удалось добавить место");}finally{setBusy(false)}}
  async function createContract(){setBusy(true);setError("");try{await post("/api/housing/contracts",{siteId:site.id,partnerId:contractPartnerId||null,contractNumber:contractNumber||null,signedOn:signedOn||null,validFrom,validTo:validTo||null,billingModel,bookedCapacity:bookedCapacity?Number(bookedCapacity):null,rateAmount:Number(contractRate||0),depositAmount:depositAmount?Number(depositAmount):null,paymentDay:paymentDay?Number(paymentDay):null,prepaidUntil:prepaidUntil||null,nextPaymentDue:nextPaymentDue||null,noticeDays:noticeDays?Number(noticeDays):null,autoRenew:false});}catch(e){setError(e instanceof Error?e.message:"Не удалось создать договор");}finally{setBusy(false)}}
  async function recordPayment(){if(!activeContract)return;setBusy(true);setError("");try{await post("/api/housing/contracts",{action:"record_payment",id:activeContract.id,amount:Number(paymentAmount),paymentDate,prepaidUntil:paymentPrepaidUntil||null,nextPaymentDue:paymentNextDue||null,objectId:paymentObjectId||null},"PATCH");}catch(e){setError(e instanceof Error?e.message:"Не удалось зафиксировать оплату");}finally{setBusy(false)}}
  async function createDocument(){setBusy(true);setError("");try{await post("/api/housing/documents",{siteId:site.id,contractId:activeContract?.id??null,name:documentName,category:documentCategory,documentNumber:documentNumber||null,documentDate:documentDate||null,sourceUrl:documentUrl||null,expiresAt:documentExpiresAt||null});}catch(e){setError(e instanceof Error?e.message:"Не удалось добавить документ");}finally{setBusy(false)}}
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

  return <div className="housing-site-workspace object-workspace-pilot">
    <div className="object-pilot-breadcrumbs"><Link href="/supply/housing">Жильё</Link><span>/</span><span>{siteTypeLabels[site.siteType]??"Жильё"}</span></div>
    <div className="object-pilot-header housing-site-header">
      <div className="object-pilot-title">
        <div><Status tone={state.tone}>{state.label}</Status><span className="object-pilot-code">{siteTypeLabels[site.siteType]??"Жильё"}</span></div>
        <h1>{site.name}</h1>
        <p>{site.address??"Адрес не указан"}</p>
      </div>
      <div className="object-pilot-health">
        <strong>{freeAfterPlans}</strong><span>свободно после планов</span><small>{site.occupied} проживает · квота {booked}</small>
      </div>
      <div className="object-pilot-meta">
        <div><span>Ответственный</span><strong>{site.responsible??site.objectLinks[0]?.manager??"—"}</strong></div>
        <div><span>Подрядчик</span><strong>{site.partner??site.vendor??"—"}</strong></div>
        <div><span>Объекты</span><strong>{site.objectLinks.length||"—"}</strong></div>
        <div><span>Договор</span><strong>{activeContract?(activeContract.signedOn?"Подписан":"Не подписан"):"Не заведён"}</strong></div>
      </div>
      <div className="object-primary-nav"><EntityTabs items={tabs} active={tabs.find(item=>item.href.includes("tab="+tab))?.label??"Обзор"}/></div>
    </div>

    {tab==="overview"&&<>
      <div className="metrics-grid housing-site-metrics">
        <div className="metric"><span>Физическая вместимость</span><strong>{site.capacity}</strong><small>по комнатам и блокам</small></div>
        <div className="metric"><span>Наша квота</span><strong>{booked}</strong><small>по действующему договору</small></div>
        <div className="metric"><span>Свободно сейчас</span><strong>{freeNow}</strong><small>{site.occupied} фактически проживает</small></div>
        <div className="metric"><span>Свободно после планов</span><strong>{freeAfterPlans}</strong><small>+{site.plannedArrivals} заедет · −{site.plannedDepartures} выселится</small></div>
      </div>
      <div className="workspace-grid housing-site-overview-grid">
        <div>
          <section className="section">
            <div className="section-head"><div><h2>Основная информация</h2><p>Контакты, связанные объекты и правила проживания</p></div>{canManage&&!edit&&<button className="button" onClick={()=>setEdit(true)}>Изменить</button>}</div>
            {!edit?<div className="housing-site-overview-content">
              <div className="reconcile housing-detail-kv"><div><span>Подрядчик</span><strong>{site.partner??site.vendor??"—"}</strong></div><div><span>Ответственный</span><strong>{site.responsible??"—"}</strong></div><div><span>Контакт</span><strong>{site.contactName??"—"}</strong><small>{site.contactPhone??""}</small></div><div><span>Физическая вместимость</span><strong>{site.capacity}</strong></div></div>
              <div className="housing-detail-section"><div className="section-head"><div><h3>Связанные объекты</h3></div></div>{site.objectLinks.map(link=><div className="stack-item" key={link.objectId}><div><strong>{link.object}</strong><small>{link.manager??"Менеджер не назначен"}</small></div><Status tone={link.relationType==="primary"?"info":"neutral"}>{link.relationType==="primary"?"Основной":"Использует жильё"}</Status></div>)}</div>
              <div className="housing-detail-section"><div className="section-head"><div><h3>Правила и заметки</h3></div></div><div className="housing-notes-grid"><div><span>Заселение</span><p>{site.checkInRules??"Не указано"}</p></div><div><span>Выселение</span><p>{site.checkOutRules??"Не указано"}</p></div><div className="span-2"><span>Комментарий</span><p>{site.notes??"Нет комментария"}</p></div></div></div>
            </div>:<div className="housing-site-edit-wrap"><div className="form-grid two housing-edit-form"><label className="span-2"><span>Название</span><input value={name} onChange={e=>setName(e.target.value)}/></label><label><span>Тип</span><select value={siteType} onChange={e=>setSiteType(e.target.value)}>{Object.entries(siteTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Подрядчик</span><select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не выбран</option>{partners.filter(row=>row.categories.includes("housing")).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="span-2"><span>Адрес</span><input value={address} onChange={e=>setAddress(e.target.value)}/></label><label><span>Контакт</span><input value={contactName} onChange={e=>setContactName(e.target.value)}/></label><label><span>Телефон</span><input value={contactPhone} onChange={e=>setContactPhone(e.target.value)}/></label><label className="span-2"><span>Объекты</span><div className="housing-object-picker">{options.objects.map(object=><label key={object.id}><input type="checkbox" checked={formObjectIds.includes(object.id)} onChange={()=>toggleObject(object.id)}/>{object.name}</label>)}</div></label><label className="span-2"><span>Правила заселения</span><textarea value={checkInRules} onChange={e=>setCheckInRules(e.target.value)}/></label><label className="span-2"><span>Правила выселения</span><textarea value={checkOutRules} onChange={e=>setCheckOutRules(e.target.value)}/></label><label className="span-2"><span>Комментарий</span><textarea value={siteNotes} onChange={e=>setSiteNotes(e.target.value)}/></label><div className="span-2 page-actions"><button className="button" onClick={()=>setEdit(false)}>Отмена</button><button className="button primary" disabled={busy||!name||!formObjectIds.length} onClick={()=>void saveSite()}>Сохранить</button></div></div>{error&&<div className="recruiting-error">{error}</div>}</div>}
          </section>
        </div>
        <div>
          <section className="section">
            <div className="section-head"><div><h2>Требует внимания</h2><p>То, что нужно проверить по этому жилью</p></div></div>
            <div className="stack-list">
              {!activeContract&&<div className="stack-item"><div><strong>Нет действующего договора</strong><small>Квота и условия оплаты не зафиксированы.</small></div><Link className="button" href={"/supply/housing/"+site.id+"?tab=contract"}>Договор</Link></div>}
              {activeContract&&!activeContract.signedOn&&<div className="stack-item"><div><strong>Договор не отмечен как подписанный</strong><small>{activeContract.contractNumber?"№ "+activeContract.contractNumber:"Без номера"}</small></div><Link className="button" href={"/supply/housing/"+site.id+"?tab=contract"}>Проверить</Link></div>}
              {freeAfterPlans<0&&<div className="stack-item"><div><strong>Не хватает мест после плановых движений</strong><small>Дефицит {Math.abs(freeAfterPlans)} мест.</small></div><Link className="button" href={"/supply/housing/"+site.id+"?tab=units"}>Места</Link></div>}
              {attentionStays.slice(0,4).map(row=><div className="stack-item" key={row.id}><div><strong>{row.worker}</strong><small>Работа завершена или завершается, проживание не закрыто.</small></div><Link className="button" href={"/supply/housing/"+site.id+"?tab=residents"}>Проживающие</Link></div>)}
              {activeContract&&contractAttention(activeContract)&&activeContract.signedOn&&<div className="stack-item"><div><strong>Проверьте срок договора или оплату</strong><small>{activeContract.nextPaymentDue?"Следующая оплата "+activeContract.nextPaymentDue:"Срок оплаты не задан"}</small></div><Link className="button" href={"/supply/housing/"+site.id+"?tab=contract"}>Договор</Link></div>}
              {activeContract&&activeContract.signedOn&&freeAfterPlans>=0&&!attentionStays.length&&!contractAttention(activeContract)&&<div className="empty-inline">Отклонений, требующих действия, нет.</div>}
            </div>
          </section>
        </div>
      </div>
    </>}

    {tab==="units"&&<section className="section section-flush">
      <div className="section-head"><div><h2>Комнаты и блоки</h2><p>Фактическая вместимость и прогноз занятости</p></div>{canManage&&<button className="button primary" onClick={()=>{setNewUnitName("");setNewUnitCapacity("1");setShowUnit(true)}}><Plus size={14}/> Добавить</button>}</div>
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Место</th><th>Тип</th><th>Вместимость</th><th>Проживает</th><th>Заедет</th><th>Выселится</th><th>Свободно после планов</th></tr></thead><tbody>{units.map(unit=>{const free=unit.capacity-(unit.occupied+unit.plannedArrivals-unit.plannedDepartures);return <tr key={unit.id}><td><strong>{unit.name}</strong><span className="cell-sub">{unit.notes??""}</span></td><td>{unitTypeLabels[unit.unitType]??unit.unitType}</td><td className="num">{unit.capacity}</td><td className="num">{unit.occupied}</td><td className="num">{unit.plannedArrivals}</td><td className="num">{unit.plannedDepartures}</td><td><Status tone={free<0?"bad":free===0?"warn":"good"}>{free}</Status></td></tr>})}</tbody></table>{!units.length&&<div className="empty-inline">Комнаты и блоки не заведены.</div>}</div>
    </section>}

    {tab==="residents"&&<section className="section section-flush">
      <div className="section-head"><div><h2>Проживающие</h2><p>Плановые и фактические заселения и выселения</p></div>{canManage&&<button className="button primary" onClick={()=>setShowStay(true)}><UserPlus size={14}/> Заселить</button>}</div>
      <StayTable rows={stays} canManage={canManage} onAction={openStayAction}/>
    </section>}

    {tab==="contract"&&<section className="section">
      <div className="section-head"><div><h2>Договор и условия</h2><p>Квота, стоимость, депозит и календарь оплат</p></div>{canManage&&<button className="button primary" onClick={()=>setShowContract(true)}><Plus size={14}/> Новый договор</button>}</div>
      {activeContract?<div className="housing-contract-card housing-site-contract-content"><div className="reconcile"><div><span>Договор</span><strong>{activeContract.contractNumber?"№ "+activeContract.contractNumber:"Без номера"}</strong><small>{activeContract.signedOn?"подписан "+activeContract.signedOn:"не отмечен как подписанный"}</small></div><div><span>Условия</span><strong>{rateLabels[activeContract.billingModel]??activeContract.billingModel}</strong><small>{rub(activeContract.rateAmount)}</small></div><div><span>Квота</span><strong>{activeContract.bookedCapacity??"—"}</strong><small>мест</small></div><div><span>Депозит</span><strong>{activeContract.depositAmount==null?"—":rub(activeContract.depositAmount)}</strong></div></div><div className="stack-list"><div className="stack-item"><div><strong>Срок действия</strong><small>{activeContract.validFrom} — {activeContract.validTo??"бессрочно"}</small></div><Status tone={activeContract.signedOn?"good":"warn"}>{activeContract.signedOn?"Подписан":"Не подписан"}</Status></div><div className="stack-item"><div><strong>Оплата</strong><small>Оплачено до {activeContract.prepaidUntil??"—"} · следующая {activeContract.nextPaymentDue??"—"}</small></div>{canManage&&<button className="button" onClick={()=>setPaymentOpen(true)}>Зафиксировать оплату</button>}</div><div className="stack-item"><div><strong>Подрядчик</strong><small>{activeContract.partner??site.partner??site.vendor??"Не указан"}</small></div><span className="muted">{activeContract.noticeDays!=null?"уведомление "+activeContract.noticeDays+" дн.":"срок уведомления не задан"}</span></div></div></div>:<div className="empty-inline housing-site-empty">Действующий договор не заведен.</div>}
    </section>}

    {tab==="payments"&&<section className="section section-flush">
      <div className="section-head"><div><h2>Оплаты</h2><p>Фактические расходы жилья в экономике связанных объектов</p></div>{canManage&&activeContract&&<button className="button primary" onClick={()=>setPaymentOpen(true)}>Зафиксировать оплату</button>}</div>
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Объект затрат</th><th>Сумма</th><th>Подрядчик</th><th>Основание</th><th>Оформил</th></tr></thead><tbody>{payments.map(row=><tr key={row.id}><td>{row.expenseDate}</td><td>{row.object}</td><td className="num">{rub(row.amount)}</td><td>{row.vendor??"—"}</td><td>{row.reference??"—"}</td><td>{row.createdBy}</td></tr>)}</tbody></table>{!payments.length&&<div className="empty-inline">Оплаты по жилью ещё не зафиксированы.</div>}</div>
    </section>}

    {tab==="documents"&&<section className="section section-flush">
      <div className="section-head"><div><h2>Документы</h2><p>Договоры, акты, счета и правила проживания</p></div>{canManage&&<button className="button primary" onClick={()=>setShowDocument(true)}><Plus size={14}/> Добавить документ</button>}</div>
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Документ</th><th>Категория</th><th>Дата</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>{documents.map(row=><tr key={row.id}><td><strong>{row.name}</strong><span className="cell-sub">{row.documentNumber?"№ "+row.documentNumber:row.notes??""}</span></td><td>{documentLabels[row.category]??row.category}</td><td>{row.documentDate??"—"}</td><td>{row.expiresAt??"Бессрочно"}</td><td><Status tone={row.status==="active"?"good":row.status==="needs_update"?"warn":"neutral"}>{row.status==="active"?"Актуален":row.status==="needs_update"?"Обновить":"Архив"}</Status></td><td>{row.sourceUrl&&<a className="button" href={row.sourceUrl} target="_blank" rel="noreferrer">Открыть</a>}</td></tr>)}</tbody></table>{!documents.length&&<div className="empty-inline">Документы ещё не добавлены.</div>}</div>
    </section>}

    {tab==="history"&&<section className="section">
      <div className="section-head"><div><h2>История</h2><p>Системные события по жилью</p></div></div>
      <div className="housing-history-list housing-site-history">{history.map(row=><div className="activity-line" key={row.id}><time>{row.createdAt}</time><div><strong>{row.actor}</strong><br/><span>{row.summary}</span></div></div>)}{!history.length&&<div className="empty-inline">Событий по жилью пока нет.</div>}</div>
    </section>}

    {showStay&&<SimpleModal title="Заселение сотрудника" text="Плановая дата выезда не освобождает место фактически — выселение подтверждается отдельно." onClose={()=>setShowStay(false)} footer={<><button className="button" onClick={()=>setShowStay(false)}>Отмена</button><button className="button primary" disabled={busy||!workerId} onClick={()=>void createStay()}>Сохранить</button></>}>
      <div className="form-grid two"><label><span>Сотрудник</span><select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.filter(row=>site.objectLinks.some(link=>link.objectId===row.objectId)).map(row=><option key={row.id} value={row.id}>{row.fullName}{row.object?" · "+row.object:""}</option>)}</select></label><label><span>Комната / блок</span><select value={stayUnitId} onChange={e=>setStayUnitId(e.target.value)}><option value="">Не указано</option>{units.filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{row.name} · {row.occupied}/{row.capacity}</option>)}</select></label><label><span>Место</span><input value={bedLabel} onChange={e=>setBedLabel(e.target.value)}/></label><label><span>Заезд</span><input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label><span>Плановый выезд</span><input type="date" value={plannedCheckOut} onChange={e=>setPlannedCheckOut(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {showUnit&&<SimpleModal title="Комната или блок" text={site.name} onClose={()=>setShowUnit(false)} footer={<><button className="button" onClick={()=>setShowUnit(false)}>Отмена</button><button className="button primary" disabled={busy||!newUnitName||!newUnitCapacity} onClick={()=>void createUnit()}>Добавить</button></>}>
      <div className="form-grid two"><label><span>Название</span><input value={newUnitName} onChange={e=>setNewUnitName(e.target.value)}/></label><label><span>Тип</span><select value={newUnitType} onChange={e=>setNewUnitType(e.target.value)}>{Object.entries(unitTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Вместимость</span><input type="number" min="1" value={newUnitCapacity} onChange={e=>setNewUnitCapacity(e.target.value)}/></label><label><span>Комментарий</span><input value={newUnitNotes} onChange={e=>setNewUnitNotes(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {showContract&&<SimpleModal title="Договор по жилью" text="Фиксируем договорную квоту, тариф, депозит и календарь оплат." onClose={()=>setShowContract(false)} footer={<><button className="button" onClick={()=>setShowContract(false)}>Отмена</button><button className="button primary" disabled={busy||!validFrom||!contractRate} onClick={()=>void createContract()}>Создать договор</button></>}>
      <div className="form-grid two"><label><span>Подрядчик</span><select value={contractPartnerId} onChange={e=>setContractPartnerId(e.target.value)}><option value="">Не указан</option>{partners.filter(row=>row.categories.includes("housing")).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Номер договора</span><input value={contractNumber} onChange={e=>setContractNumber(e.target.value)}/></label><label><span>Дата подписания</span><input type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)}/></label><label><span>Действует с</span><input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label><label><span>Действует до</span><input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)}/></label><label><span>Модель оплаты</span><select value={billingModel} onChange={e=>setBillingModel(e.target.value)}>{Object.entries(rateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Забронировано мест</span><input type="number" min="0" value={bookedCapacity} onChange={e=>setBookedCapacity(e.target.value)}/></label><label><span>Тариф</span><input type="number" min="0" value={contractRate} onChange={e=>setContractRate(e.target.value)}/></label><label><span>Депозит</span><input type="number" min="0" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)}/></label><label><span>Платёжный день</span><input type="number" min="1" max="31" value={paymentDay} onChange={e=>setPaymentDay(e.target.value)}/></label><label><span>Оплачено до</span><input type="date" value={prepaidUntil} onChange={e=>setPrepaidUntil(e.target.value)}/></label><label><span>Следующая оплата</span><input type="date" value={nextPaymentDue} onChange={e=>setNextPaymentDue(e.target.value)}/></label><label><span>Уведомление, дней</span><input type="number" min="0" value={noticeDays} onChange={e=>setNoticeDays(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {paymentOpen&&activeContract&&<SimpleModal title="Оплата жилья" text="Фактический расход попадёт в экономику выбранного связанного объекта." onClose={()=>setPaymentOpen(false)} footer={<><button className="button" onClick={()=>setPaymentOpen(false)}>Отмена</button><button className="button primary" disabled={busy||!paymentAmount||!paymentDate||!paymentObjectId} onClick={()=>void recordPayment()}>Зафиксировать оплату</button></>}>
      <div className="form-grid two"><label><span>Объект затрат</span><select value={paymentObjectId} onChange={e=>setPaymentObjectId(e.target.value)}>{site.objectLinks.map(link=><option key={link.objectId} value={link.objectId}>{link.object}</option>)}</select></label><label><span>Сумма</span><input type="number" min="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label><span>Дата оплаты</span><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label><span>Оплачено до</span><input type="date" value={paymentPrepaidUntil} onChange={e=>setPaymentPrepaidUntil(e.target.value)}/></label><label><span>Следующая оплата</span><input type="date" value={paymentNextDue} onChange={e=>setPaymentNextDue(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {showDocument&&<SimpleModal title="Документ жилья" text="Ссылка ведёт в исходное хранилище; копия файла внутри жилья не создаётся." onClose={()=>setShowDocument(false)} footer={<><button className="button" onClick={()=>setShowDocument(false)}>Отмена</button><button className="button primary" disabled={busy||!documentName} onClick={()=>void createDocument()}>Добавить</button></>}>
      <div className="form-grid two"><label className="span-2"><span>Название</span><input value={documentName} onChange={e=>setDocumentName(e.target.value)}/></label><label><span>Категория</span><select value={documentCategory} onChange={e=>setDocumentCategory(e.target.value)}>{Object.entries(documentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Номер</span><input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)}/></label><label><span>Дата</span><input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)}/></label><label><span>Действует до</span><input type="date" value={documentExpiresAt} onChange={e=>setDocumentExpiresAt(e.target.value)}/></label><label className="span-2"><span>Ссылка</span><input type="url" value={documentUrl} onChange={e=>setDocumentUrl(e.target.value)} placeholder="https://…"/></label></div>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}

    {stayAction&&<SimpleModal title={stayAction.action==="plan_checkout"?"Плановое выселение":stayAction.action==="confirm_checkin"?"Подтвердить заселение":stayAction.action==="confirm_checkout"?"Подтвердить выселение":"Отменить заселение"} text={stayAction.row.worker+" · "+site.name} onClose={()=>setStayAction(null)} footer={<><button className="button" onClick={()=>setStayAction(null)}>Отмена</button><button className="button primary" disabled={busy||(stayAction.action!=="cancel"&&!stayActionDate)} onClick={()=>void applyStayAction()}>Сохранить</button></>}>
      {stayAction.action!=="cancel"&&<label><span>Дата</span><input type="date" value={stayActionDate} onChange={e=>setStayActionDate(e.target.value)}/></label>}<label><span>Комментарий</span><textarea value={stayActionNote} onChange={e=>setStayActionNote(e.target.value)}/></label>{error&&<div className="recruiting-error">{error}</div>}
    </SimpleModal>}
  </div>;
}

function StayTable({rows,canManage,onAction}:{rows:HousingControlStayRow[];canManage:boolean;onAction:(row:HousingControlStayRow,action:StayAction)=>void}){
  return <div className="request-table-wrap"><table className="data-table housing-stays-table"><thead><tr><th>Сотрудник</th><th>Менеджер</th><th>Объект</th><th>Комната / место</th><th>Заезд</th><th>Плановый выезд</th><th>Фактический выезд</th><th>Статус</th>{canManage&&<th>Действия</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={stayNeedsAttention(row)?"row-attention":""}><td><strong className="cell-title">{row.worker}</strong>{row.exitDate&&<span className="cell-sub">завершение работы {row.exitDate}</span>}</td><td>{row.manager??"—"}</td><td>{row.object??"—"}</td><td>{[row.unit,row.bedLabel&&"место "+row.bedLabel].filter(Boolean).join(" · ")||"место не уточнено"}</td><td>{row.actualCheckIn??row.checkIn}{row.status==="planned"&&<span className="cell-sub">план</span>}</td><td>{row.plannedCheckOut??"—"}</td><td>{row.actualCheckOut??"—"}</td><td><Status tone={stayNeedsAttention(row)?"warn":row.status==="active"?"good":row.status==="planned"?"info":"neutral"}>{stayNeedsAttention(row)?"Закрыть проживание":stayStatusLabels[row.status]??row.status}</Status></td>{canManage&&<td><div className="housing-row-actions">{row.status==="planned"&&<button className="table-link" onClick={()=>onAction(row,"confirm_checkin")}>Заселён</button>}{row.status==="active"&&<button className="table-link" onClick={()=>onAction(row,"plan_checkout")}>{row.plannedCheckOut?"Изменить выезд":"План выезда"}</button>}{row.status==="active"&&<button className="table-link" onClick={()=>onAction(row,"confirm_checkout")}>Выселен</button>}{row.status==="planned"&&<button className="table-link" onClick={()=>onAction(row,"cancel")}>Отменить</button>}</div></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty-inline">Заселений нет.</div>}</div>;
}
function SimpleModal({title,text,onClose,footer,children}:{title:string;text?:string;onClose:()=>void;footer:React.ReactNode;children:React.ReactNode}){return <Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>{title}</h2>{text&&<p>{text}</p>}</div><button className="icon-button" onClick={onClose}><X size={17}/></button></div><div className="candidate-import-body">{children}</div><div className="recruiting-modal-footer">{footer}</div></div></div></Portal>}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
