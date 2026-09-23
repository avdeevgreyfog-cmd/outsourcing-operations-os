"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import type { HousingSnapshot, OperationsReferenceData } from "@/lib/operations/service";
import { rub } from "@/lib/ui/format";

const rateLabels:Record<string,string>={bed_day:"Койко-место / сутки",room_day:"Комната / сутки",room_month:"Комната / месяц",site_period:"Объект / период"};

export function HousingWorkspace({snapshot,options,canManage,demo,initialWorkerId}:{snapshot:HousingSnapshot;options:OperationsReferenceData;canManage:boolean;demo:boolean;initialWorkerId?:string|null}){
  const [showSite,setShowSite]=useState(false);
  const [showStay,setShowStay]=useState(Boolean(initialWorkerId)&&canManage);
  const [name,setName]=useState("");
  const [address,setAddress]=useState("");
  const [vendor,setVendor]=useState("");
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [rateModel,setRateModel]=useState<"bed_day"|"room_day"|"room_month"|"site_period">("bed_day");
  const [rateAmount,setRateAmount]=useState("");
  const [unitName,setUnitName]=useState("Комната 1");
  const [capacity,setCapacity]=useState("1");
  const [workerId,setWorkerId]=useState(initialWorkerId??"");
  const [siteId,setSiteId]=useState(snapshot.sites[0]?.id??"");
  const [bedLabel,setBedLabel]=useState("");
  const [checkIn,setCheckIn]=useState(new Date().toISOString().slice(0,10));
  const [checkOut,setCheckOut]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const activeStays=useMemo(()=>snapshot.stays.filter(row=>row.status==="active"||row.status==="planned"),[snapshot.stays]);
  const totalCapacity=snapshot.sites.reduce((sum,row)=>sum+row.capacity,0);
  const occupied=snapshot.sites.reduce((sum,row)=>sum+row.occupied,0);
  const forecast=snapshot.sites.reduce((sum,row)=>sum+row.monthlyForecast,0);

  async function post(url:string,body:unknown){
    if(demo){setError("Изменения жилья в текущем режиме недоступны");return false;}
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error??"Операция не выполнена");
    window.location.reload();return true;
  }
  async function createSite(){
    setBusy(true);setError("");
    try{await post("/api/housing/sites",{name,address:address||null,vendor:vendor||null,objectId,rateModel,rateAmount:Number(rateAmount||0),unitName,capacity:Number(capacity)});}
    catch(e){setError(e instanceof Error?e.message:"Не удалось создать жильё");}
    finally{setBusy(false);}
  }
  async function createStay(){
    setBusy(true);setError("");
    try{await post("/api/housing/stays",{workerId,siteId,bedLabel:bedLabel||null,checkIn,checkOut:checkOut||null});}
    catch(e){setError(e instanceof Error?e.message:"Не удалось заселить сотрудника");}
    finally{setBusy(false);}
  }

  return <div>
    <div className="metrics-grid">
      <Metric label="Объекты проживания" value={snapshot.sites.length}/>
      <Metric label="Вместимость" value={totalCapacity}/>
      <Metric label="Занято" value={occupied}/>
      <Metric label="Прогноз затрат / мес" value={rub(forecast)}/>
    </div>
    <div className="candidate-directory-viewbar">
      <div className="summary-strip"><span>Учитываются койко-места и целые комнаты: при аренде комнаты целиком расход не зависит от числа проживающих.</span></div>
      {canManage&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>setShowStay(true)}><UserPlus size={14}/> Заселить</button><button className="button primary" onClick={()=>setShowSite(true)}><Plus size={14}/> Добавить жильё</button></div>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Жильё</th><th>Объект</th><th>Тариф</th><th>Вместимость</th><th>Занято</th><th>Свободно</th><th>Прогноз / мес</th><th>Ответственный</th></tr></thead>
      <tbody>{snapshot.sites.map(row=><tr key={row.id}>
        <td><strong className="cell-title">{row.name}</strong><span className="cell-sub">{row.address??row.vendor??"Адрес не указан"}</span></td>
        <td>{row.object??"Без объекта"}</td><td>{rateLabels[row.rateModel]}<span className="cell-sub">{rub(row.rateAmount)}</span></td>
        <td className="num">{row.capacity}</td><td className="num">{row.occupied}</td><td className="num"><Status tone={row.available>0?"good":"warn"}>{row.available}</Status></td>
        <td className="num">{rub(row.monthlyForecast)}</td><td>{row.responsible??"—"}</td>
      </tr>)}</tbody>
    </table>{!snapshot.sites.length&&<div className="empty-inline">Жильё ещё не добавлено</div>}</div></section>

    <section className="section section-flush" style={{marginTop:16}}><div className="section-head"><div><h2>Заселения</h2><p>Активные и плановые размещения сотрудников</p></div></div><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Сотрудник</th><th>Объект</th><th>Жильё</th><th>Комната / место</th><th>Заезд</th><th>Выезд</th><th>Статус</th></tr></thead>
      <tbody>{activeStays.map(row=><tr key={row.id}><td className="cell-title">{row.worker}</td><td>{row.object??"—"}</td><td>{row.site}</td><td>{row.unit??"—"}{row.bedLabel&&<span className="cell-sub">место {row.bedLabel}</span>}</td><td>{row.checkIn}</td><td>{row.checkOut??"—"}</td><td><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></td></tr>)}</tbody>
    </table>{!activeStays.length&&<div className="empty-inline">Активных заселений нет</div>}</div></section>

    {showSite&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowSite(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новое жильё</h2><p>Тариф можно считать по человеку, комнате или фиксированному периоду.</p></div><button className="icon-button" onClick={()=>setShowSite(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Название<input value={name} onChange={e=>setName(e.target.value)} placeholder="Общежитие Химиков 8"/></label>
        <label>Адрес<input value={address} onChange={e=>setAddress(e.target.value)}/></label>
        <label>Поставщик / арендодатель<input value={vendor} onChange={e=>setVendor(e.target.value)}/></label>
        <label>Основной объект<select value={objectId} onChange={e=>setObjectId(e.target.value)}>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Модель тарифа<select value={rateModel} onChange={e=>setRateModel(e.target.value as typeof rateModel)}>{Object.entries(rateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Стоимость<input type="number" min="0" value={rateAmount} onChange={e=>setRateAmount(e.target.value)}/></label>
        <label>Комната / блок<input value={unitName} onChange={e=>setUnitName(e.target.value)}/></label>
        <label>Мест<input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label>
      </div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowSite(false)}>Отмена</button><button className="button primary" disabled={busy||!name||!objectId} onClick={()=>void createSite()}>{busy?"Сохраняю…":"Создать"}</button></div>
    </div></div></Portal>}

    {showStay&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowStay(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Заселение сотрудника</h2><p>Период проживания сохраняется в истории сотрудника и объекта.</p></div><button className="icon-button" onClick={()=>setShowStay(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Сотрудник<select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(x=><option key={x.id} value={x.id}>{x.fullName}{x.object?" · "+x.object:""}</option>)}</select></label>
        <label>Жильё<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Выберите</option>{snapshot.sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Место / кровать<input value={bedLabel} onChange={e=>setBedLabel(e.target.value)} placeholder="Например 3"/></label>
        <label>Заезд<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label>
        <label>Плановый выезд<input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
      </div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowStay(false)}>Отмена</button><button className="button primary" disabled={busy||!workerId||!siteId} onClick={()=>void createStay()}>{busy?"Сохраняю…":"Заселить"}</button></div>
    </div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
