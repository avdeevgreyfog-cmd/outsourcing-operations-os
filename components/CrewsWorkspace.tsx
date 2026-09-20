"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import type { CrewRow, OperationsReferenceData } from "@/lib/operations/service";

export function CrewsWorkspace({rows,options,canManage,demo}:{rows:CrewRow[];options:OperationsReferenceData;canManage:boolean;demo:boolean}){
  const [localRows,setLocalRows]=useState(rows);
  const [show,setShow]=useState(false);
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [name,setName]=useState("");
  const [specialtyId,setSpecialtyId]=useState("");
  const [leaderWorkerId,setLeaderWorkerId]=useState("");
  const [leaderMode,setLeaderMode]=useState<"working_leader"|"dedicated">("working_leader");
  const [bonusAmount,setBonusAmount]=useState("");
  const [bonusUnit,setBonusUnit]=useState<"hour"|"shift"|"month"|"period">("shift");
  const [memberIds,setMemberIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const workers=useMemo(()=>options.workers.filter(worker=>!objectId||worker.objectId===objectId),[options.workers,objectId]);

  async function save(){
    setBusy(true);setError("");
    try{
      if(!objectId||!name.trim())throw new Error("Укажите объект и название бригады");
      if(demo){
        const object=options.objects.find(x=>x.id===objectId);
        const leader=options.workers.find(x=>x.id===leaderWorkerId);
        const specialty=options.specialties.find(x=>x.id===specialtyId);
        setLocalRows(current=>[...current,{id:crypto.randomUUID(),organizationId:"demo",objectId,object:object?.name??"Объект",specialtyId:specialtyId||null,specialty:specialty?.name??null,name,leaderWorkerId:leaderWorkerId||null,leader:leader?.fullName??null,leaderMode,bonusAmount:bonusAmount?Number(bonusAmount):null,bonusUnit:bonusAmount?bonusUnit:null,memberCount:memberIds.length,status:"active",ownerUserId:null,assigneeUserIds:[]}]);
      }else{
        const response=await fetch("/api/crews",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({objectId,name,specialtyId:specialtyId||null,leaderWorkerId:leaderWorkerId||null,leaderMode,bonusAmount:bonusAmount?Number(bonusAmount):null,bonusUnit:bonusAmount?bonusUnit:null,memberIds})});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось создать бригаду");
        window.location.reload();
      }
      setShow(false);setName("");setMemberIds([]);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать бригаду");}
    finally{setBusy(false);}
  }

  return <div>
    <div className="candidate-directory-viewbar">
      <div className="summary-strip"><span>Активных бригад <strong>{localRows.filter(x=>x.status==="active").length}</strong></span><span>Людей в составах <strong>{localRows.reduce((sum,row)=>sum+row.memberCount,0)}</strong></span></div>
      {canManage&&<button className="button primary" onClick={()=>setShow(true)}><Plus size={14}/> Создать бригаду</button>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Бригада</th><th>Объект</th><th>Профессия</th><th>Бригадир</th><th>Формат</th><th>Доплата</th><th>Состав</th><th>Статус</th></tr></thead>
      <tbody>{localRows.map(row=><tr key={row.id}>
        <td className="cell-title">{row.name}</td><td>{row.object}</td><td>{row.specialty??"Смешанная"}</td><td>{row.leader??"Не назначен"}</td>
        <td>{row.leaderMode==="working_leader"?"Рабочий-бригадир":"Выделенный бригадир"}</td>
        <td>{row.bonusAmount==null?"—":`${row.bonusAmount.toLocaleString("ru-RU")} ₽/${bonusLabel(row.bonusUnit)}`}</td>
        <td className="num">{row.memberCount}</td><td><Status tone={row.status==="active"?"good":"neutral"}>{row.status==="active"?"Активна":"Закрыта"}</Status></td>
      </tr>)}</tbody>
    </table>{!localRows.length&&<div className="empty-inline">Бригады ещё не созданы</div>}</div></section>
    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новая бригада</h2><p>Рабочий-бригадир остаётся в производственном составе; выделенный бригадир учитывается как отдельная управленческая роль.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body">
        <div className="candidate-import-options">
          <label>Объект<select value={objectId} onChange={e=>{setObjectId(e.target.value);setMemberIds([]);setLeaderWorkerId("")}}>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Название<input value={name} onChange={e=>setName(e.target.value)} placeholder="Бригада 1"/></label>
          <label>Профессия<select value={specialtyId} onChange={e=>setSpecialtyId(e.target.value)}><option value="">Смешанная</option>{options.specialties.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Бригадир<select value={leaderWorkerId} onChange={e=>setLeaderWorkerId(e.target.value)}><option value="">Не назначен</option>{workers.map(x=><option key={x.id} value={x.id}>{x.fullName}</option>)}</select></label>
          <label>Формат<select value={leaderMode} onChange={e=>setLeaderMode(e.target.value as "working_leader"|"dedicated")}><option value="working_leader">Рабочий-бригадир</option><option value="dedicated">Выделенный бригадир</option></select></label>
          <label>Доплата<input type="number" min="0" value={bonusAmount} onChange={e=>setBonusAmount(e.target.value)} placeholder="0"/></label>
          <label>За период<select value={bonusUnit} onChange={e=>setBonusUnit(e.target.value as typeof bonusUnit)}><option value="shift">смену</option><option value="hour">час</option><option value="month">месяц</option><option value="period">период</option></select></label>
        </div>
        <div className="section" style={{padding:14}}><strong>Состав бригады</strong><div className="candidate-import-options" style={{marginTop:10}}>{workers.map(worker=><label key={worker.id} style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={memberIds.includes(worker.id)} onChange={e=>setMemberIds(current=>e.target.checked?[...current,worker.id]:current.filter(id=>id!==worker.id))}/>{worker.fullName}</label>)}</div></div>
        {error&&<div className="recruiting-error">{error}</div>}
      </div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняю…":"Создать бригаду"}</button></div>
    </div></div></Portal>}
  </div>;
}
function bonusLabel(unit:string|null){return unit==="hour"?"час":unit==="month"?"месяц":unit==="period"?"период":"смену"}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
