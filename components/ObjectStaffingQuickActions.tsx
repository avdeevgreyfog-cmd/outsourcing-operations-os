"use client";
import {useState} from "react";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import type {StaffingPlanRow} from "@/lib/operations/staffing-plan";

export type StaffingLinkedNeed={id:string;targetId:string;countRequired:number;countFilled:number;status:string;priority:string;deadline:string|null;ownerUserId:string|null};
export type StaffingRecruiter={id:string;name:string};
const labels={low:"Низкий",normal:"Обычный",high:"Высокий",critical:"Критический"} as const;
type Priority=keyof typeof labels;
type Edit={kind:"plan"|"need";count:string;reason:string;effectiveFrom:string;needId:string;priority:Priority;deadline:string;ownerUserId:string};
type Props={
 objectId:string;row:StaffingPlanRow;linkedNeeds:StaffingLinkedNeed[];recruiters:StaffingRecruiter[];
 canEditPlan:boolean;canCreateNeed:boolean;canEditNeed:boolean;demo:boolean;onSaved:()=>Promise<void>;
};

export function ObjectStaffingQuickActions({objectId,row,linkedNeeds,recruiters,canEditPlan,canCreateNeed,canEditNeed,demo,onSaved}:Props){
 const [edit,setEdit]=useState<Edit|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const active=linkedNeeds.filter(n=>n.targetId===row.id&&["open","in_progress"].includes(n.status));
 const paused=linkedNeeds.some(n=>n.targetId===row.id&&n.status==="paused");
 const requested=active.reduce((n,item)=>n+Math.max(item.countRequired-item.countFilled,0),0);
 const remaining=Math.max(row.deficit-requested,0);
 const need=active.find(n=>n.id===edit?.needId)??active[0];
 const editNeedAllowed=need?canEditNeed:canCreateNeed;
 const openPlan=(delta:number)=>{setError("");setEdit({kind:"plan",count:String(Math.max(0,row.plannedCount+delta)),reason:"",effectiveFrom:row.effectiveFrom??"",needId:"",priority:"normal",deadline:"",ownerUserId:""})};
 const openNeed=()=>{setError("");setEdit({kind:"need",count:String(remaining||1),reason:"",effectiveFrom:"",needId:active[0]?.id??"",priority:(active[0]?.priority as Priority)??"normal",deadline:active[0]?.deadline??"",ownerUserId:active[0]?.ownerUserId??""})};
 async function save(){
  if(!edit||!edit.reason.trim())return;
  const count=Number(edit.count);
  if(!Number.isInteger(count)||count<(edit.kind==="need"?1:0)||count>10000){setError("Укажите целое количество в допустимых пределах");return}
  if(edit.kind==="need"&&count>remaining){setError(`Можно добавить не более ${remaining} человек. Для большего объёма сначала измените план.`);return}
  setBusy(true);setError("");
  try{
   let url:string,payload:Record<string,unknown>;
   if(edit.kind==="plan"){
    url="/api/staffing-plan/targets";
    payload={id:row.id,objectId,specialtyId:row.specialtyId,shiftKind:row.shiftKind,plannedCount:count,effectiveFrom:edit.effectiveFrom||null,effectiveTo:row.effectiveTo,status:row.status,note:edit.reason.trim()};
   }else if(need){
    url="/api/staffing-plan/needs/expand";
    payload={objectId,targetId:row.id,needId:need.id,increment:count,reason:edit.reason.trim(),priority:edit.priority,deadline:edit.deadline||null,...(edit.ownerUserId?{ownerUserId:edit.ownerUserId}:{})};
   }else{
    url="/api/needs";
    payload={objectId,specialtyId:row.specialtyId,staffingPlanTargetId:row.id,title:`${row.specialty} · ${row.shiftKind==="day"?"День":row.shiftKind==="night"?"Ночь":"Смешанная смена"}`,countRequired:count,shiftKind:row.shiftKind,sourceKind:"object",priority:edit.priority,deadline:edit.deadline||null,quantityReason:edit.reason.trim(),...(edit.ownerUserId?{ownerUserId:edit.ownerUserId}:{})};
   }
   const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error??"Не удалось сохранить изменения");
   if(result.existing)throw Error("Потребность уже существует. Обновите данные строки и увеличьте существующий объём.");
   await onSaved();setEdit(null);
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения")}finally{setBusy(false)}
 }
 return <>
  <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
   {canEditPlan&&row.status==="active"&&<>
    <button className="button" type="button" aria-label={`Уменьшить план: ${row.specialty}`} disabled={busy||demo||row.plannedCount===0} onClick={()=>openPlan(-1)}>−</button>
    <button className="button" type="button" aria-label={`Увеличить план: ${row.specialty}`} disabled={busy||demo} onClick={()=>openPlan(1)}>+</button>
   </>}
   {row.status==="active"&&(canCreateNeed||canEditNeed)&&<button className="button" type="button" disabled={busy||demo||!editNeedAllowed||paused||remaining===0} onClick={openNeed}>{active.length?"Увеличить потребность":"Создать потребность"}</button>}
  </div>
  {paused&&!active.length&&<span className="cell-sub">Потребность приостановлена — проверьте её в реестре</span>}
  {edit&&<RegistryDrawer title={edit.kind==="plan"?"Изменить плановую численность":need?"Увеличить потребность":"Создать потребность"} subtitle={`${row.specialty} · ${row.shiftKind==="day"?"День":row.shiftKind==="night"?"Ночь":"Смешанная смена"}`} onClose={()=>{if(!busy){setEdit(null);setError("")}}} footer={<>
   <button className="button" type="button" disabled={busy} onClick={()=>setEdit(null)}>Отмена</button>
   <button className="button primary" type="button" disabled={busy||demo||!edit.reason.trim()||(edit.kind==="plan"&&Number(edit.count)===row.plannedCount)} onClick={()=>void save()}>Сохранить</button>
  </>}>
   <p>План: <strong>{row.plannedCount}</strong> · Работает: <strong>{row.actualCount}</strong> · Дефицит: <strong>{row.deficit}</strong></p>
   {edit.kind==="need"&&<p>Уже заявлено в подбор: <strong>{requested}</strong>. Ещё требуется: <strong>{remaining}</strong>.</p>}
   {edit.kind==="need"&&active.length>1&&<label className="field">Потребность<select value={edit.needId} onChange={e=>{const n=active.find(n=>n.id===e.target.value);if(n)setEdit({...edit,needId:n.id,priority:n.priority as Priority,deadline:n.deadline??"",ownerUserId:n.ownerUserId??""})}}>{active.map(n=><option key={n.id} value={n.id}>{n.countRequired} человек · {labels[n.priority as Priority]??"В работе"}</option>)}</select></label>}
   <label className="field">{edit.kind==="need"?"Добавить к потребности":"Новая плановая численность"}<input type="number" min={edit.kind==="need"?1:0} max={edit.kind==="need"?remaining:10000} step="1" value={edit.count} onChange={e=>setEdit({...edit,count:e.target.value})}/></label>
   {edit.kind==="plan"?<><label className="field">Начало периода действия<input type="date" value={edit.effectiveFrom} onChange={e=>setEdit({...edit,effectiveFrom:e.target.value})}/></label><p className="empty-inline">Потребность не меняется автоматически. После сохранения при необходимости запросите подбор отдельно.</p></>:<>
    <label className="field">Приоритет<select value={edit.priority} onChange={e=>setEdit({...edit,priority:e.target.value as Priority})}>{Object.entries(labels).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
    <label className="field">Требуемая дата выхода<input type="date" value={edit.deadline} onChange={e=>setEdit({...edit,deadline:e.target.value})}/></label>
    <label className="field">Ответственный<select value={edit.ownerUserId} onChange={e=>setEdit({...edit,ownerUserId:e.target.value})}><option value="">{need?"Сохранить текущего ответственного":"По правилам маршрутизации"}</option>{recruiters.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <p className="empty-inline">Количество по плану не изменяется. Кандидаты и история существующей потребности сохраняются.</p>
   </>}
   <label className="field">Причина<textarea value={edit.reason} onChange={e=>setEdit({...edit,reason:e.target.value})}/></label>
   {error&&<p role="alert">{error}</p>}
  </RegistryDrawer>}
 </>;
}
