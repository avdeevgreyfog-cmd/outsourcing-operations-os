"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommercialOptions, CommercialRequestDetail } from "@/lib/commercial/service";

type RoleDraft={id?:string;specialtyId:string;count:number};

const knownSources=["manual","lead","public_form","calculation"] as const;

function text(fd:FormData,key:string){const value=String(fd.get(key)??"").trim();return value||undefined}
function nullable(fd:FormData,key:string){const value=String(fd.get(key)??"").trim();return value||null}

export function RequestCreateButton({options}:{options:CommercialOptions}){
  const [open,setOpen]=useState(false);const [error,setError]=useState("");const router=useRouter();
  const [roles,setRoles]=useState<RoleDraft[]>([{specialtyId:options.specialties[0]?.id??"",count:1}]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");const fd=new FormData(event.currentTarget);
    const payload={
      clientId:nullable(fd,"clientId"),title:text(fd,"title"),source:text(fd,"source")??"manual",location:text(fd,"location"),regionId:text(fd,"regionId"),
      startDate:text(fd,"startDate"),durationText:text(fd,"durationText"),
      schedule:{pattern:text(fd,"schedulePattern")??"",presenceHours:Number(fd.get("presenceHours")||0),paidHours:Number(fd.get("paidHours")||0)},
      lunchPaid:fd.get("lunchPaid")==="on",vatMode:text(fd,"vatMode")??"with_vat",housingRule:text(fd,"housingRule"),travelRule:text(fd,"travelRule"),
      shuttleRule:text(fd,"shuttleRule"),ppeRule:text(fd,"ppeRule"),medicalRule:text(fd,"medicalRule"),citizenshipRule:text(fd,"citizenshipRule"),toolsRule:text(fd,"toolsRule"),comments:text(fd,"comments"),
      roles:roles.map(role=>({specialtyId:role.specialtyId,count:Number(role.count),schedule:{},requirements:{}})),
    };
    const response=await fetch("/api/requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const json=await response.json().catch(()=>({}));if(!response.ok){setError(json.error??"Не удалось создать заявку");return}
    setOpen(false);router.push(`/requests/${json.id}`);router.refresh();
  }
  return <><button className="button primary" onClick={()=>setOpen(true)}>+ Заявка</button>{open&&<><div className="drawer-backdrop" onClick={()=>setOpen(false)}/><aside className="drawer commercial-drawer"><button className="icon-button drawer-close" onClick={()=>setOpen(false)}>×</button><span className="eyebrow">Коммерция</span><h2>Новая заявка</h2><RequestForm options={options} roles={roles} setRoles={setRoles} onSubmit={submit} error={error}/></aside></>}</>;
}

export function RequestEditButton({request,options,canArchive}:{request:CommercialRequestDetail;options:CommercialOptions;canArchive:boolean}){
  const [open,setOpen]=useState(false);const [error,setError]=useState("");const router=useRouter();
  const [roles,setRoles]=useState<RoleDraft[]>(request.roles.map(role=>({id:role.id,specialtyId:role.specialtyId,count:role.count})));
  const locked=request.archivedAt!=null||["accepted","launched"].includes(request.status);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");const fd=new FormData(event.currentTarget);
    const payload={action:"update",clientId:nullable(fd,"clientId"),title:text(fd,"title"),source:text(fd,"source"),location:text(fd,"location"),regionId:nullable(fd,"regionId"),startDate:nullable(fd,"startDate"),durationText:nullable(fd,"durationText"),
      schedule:{...request.schedule,pattern:text(fd,"schedulePattern")??"",presenceHours:Number(fd.get("presenceHours")||0),paidHours:Number(fd.get("paidHours")||0)},lunchPaid:fd.get("lunchPaid")==="on",vatMode:nullable(fd,"vatMode"),housingRule:nullable(fd,"housingRule"),travelRule:nullable(fd,"travelRule"),shuttleRule:nullable(fd,"shuttleRule"),ppeRule:nullable(fd,"ppeRule"),medicalRule:nullable(fd,"medicalRule"),citizenshipRule:nullable(fd,"citizenshipRule"),toolsRule:nullable(fd,"toolsRule"),comments:nullable(fd,"comments"),
      roles:roles.map(role=>({id:role.id,specialtyId:role.specialtyId,count:Number(role.count),schedule:request.roles.find(item=>item.id===role.id)?.schedule??{},requirements:request.roles.find(item=>item.id===role.id)?.requirements??{}})),
    };
    const response=await fetch(`/api/requests/${request.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));if(!response.ok){setError(json.error??"Не удалось сохранить изменения");return}setOpen(false);router.refresh();
  }
  async function archive(action:"archive"|"restore"){
    setError("");const response=await fetch(`/api/requests/${request.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action})});const json=await response.json().catch(()=>({}));if(!response.ok){setError(json.error??"Не удалось изменить состояние заявки");return}setOpen(false);router.refresh();
  }
  return <><button className="button" onClick={()=>setOpen(true)}>{locked?"Управление":"Редактировать"}</button>{open&&<><div className="drawer-backdrop" onClick={()=>setOpen(false)}/><aside className="drawer commercial-drawer"><button className="icon-button drawer-close" onClick={()=>setOpen(false)}>×</button><span className="eyebrow">Заявка</span><h2>{request.title}</h2>{locked?<div className="foundation-notice"><strong>{request.archivedAt?"Заявка в архиве":"Коммерческие условия зафиксированы"}</strong><span>{request.archivedAt?"Восстановите заявку, чтобы продолжить работу.":"После принятия КП клиентом условия заявки не редактируются задним числом."}</span></div>:<RequestForm options={options} request={request} roles={roles} setRoles={setRoles} onSubmit={submit} error={error}/>} {canArchive&&<div className="drawer-danger-zone"><button type="button" className="button" onClick={()=>archive(request.archivedAt?"restore":"archive")}>{request.archivedAt?"Восстановить заявку":"Архивировать заявку"}</button></div>}{error&&locked&&<div className="form-error">{error}</div>}</aside></>}</>;
}

function RequestForm({options,request,roles,setRoles,onSubmit,error}:{options:CommercialOptions;request?:CommercialRequestDetail;roles:RoleDraft[];setRoles:(roles:RoleDraft[])=>void;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;error:string}){
  const schedule=request?.schedule??{};const schedulePattern=String(schedule.pattern??"");const presenceHours=Number(schedule.presenceHours??0);const paidHours=Number(schedule.paidHours??0);
  const customSource=request?.source&&!knownSources.includes(request.source as typeof knownSources[number])?request.source:null;
  return <form className="login-form commercial-form" onSubmit={onSubmit} style={{marginTop:18}}>
    <label className="span-2">Название<input name="title" required defaultValue={request?.title??""}/></label>
    <label>Клиент<select name="clientId" defaultValue={request?.clientId??""}><option value="">Без привязанного клиента</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Источник<select name="source" defaultValue={request?.source??"manual"}><option value="manual">Вручную</option><option value="lead">Из лида</option><option value="public_form">Публичная форма</option><option value="calculation">Из самостоятельного расчёта</option>{customSource&&<option value={customSource}>{customSource}</option>}</select></label>
    <label className="span-2">Локация<input name="location" required defaultValue={request?.location??""}/></label>
    <label>Регион<select name="regionId" required defaultValue={request?.regionId??options.regions[0]?.id}>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Плановый старт<input type="date" name="startDate" defaultValue={request?.startDate??""}/></label>
    <label>Срок / длительность<input name="durationText" defaultValue={request?.durationText??""}/></label>
    <label>НДС<select name="vatMode" defaultValue={request?.vatMode??"with_vat"}><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select></label>
    <div className="span-2 form-subsection"><strong>Позиции</strong>{roles.map((role,index)=><div className="commercial-role-row" key={role.id??index}><select value={role.specialtyId} onChange={event=>setRoles(roles.map((item,i)=>i===index?{...item,specialtyId:event.target.value}:item))}>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="number" min="1" max="5000" value={role.count} onChange={event=>setRoles(roles.map((item,i)=>i===index?{...item,count:Number(event.target.value)}:item))}/><button type="button" className="icon-button" disabled={roles.length===1} onClick={()=>setRoles(roles.filter((_,i)=>i!==index))}>×</button></div>)}<button type="button" className="button" onClick={()=>setRoles([...roles,{specialtyId:options.specialties[0]?.id??"",count:1}])}>+ Позиция</button></div>
    <label>График<input name="schedulePattern" placeholder="6/1" defaultValue={schedulePattern}/></label>
    <label>Часов присутствия<input type="number" name="presenceHours" min="0" max="24" defaultValue={presenceHours||12}/></label>
    <label>Оплачиваемых часов<input type="number" name="paidHours" min="0" max="24" defaultValue={paidHours||11}/></label>
    <label className="checkbox-label"><input type="checkbox" name="lunchPaid" defaultChecked={request?.lunchPaid??false}/> Обед оплачивается</label>
    <label>Проживание<input name="housingRule" defaultValue={request?.housingRule??""}/></label><label>Проезд<input name="travelRule" defaultValue={request?.travelRule??""}/></label>
    <label>Развозка<input name="shuttleRule" defaultValue={request?.shuttleRule??""}/></label><label>СИЗ / форма<input name="ppeRule" defaultValue={request?.ppeRule??""}/></label>
    <label>Медицина<input name="medicalRule" defaultValue={request?.medicalRule??""}/></label><label>Гражданство<input name="citizenshipRule" defaultValue={request?.citizenshipRule??""}/></label>
    <label>Инструмент<input name="toolsRule" defaultValue={request?.toolsRule??""}/></label>
    <label className="span-2">Комментарий<textarea name="comments" rows={4} defaultValue={request?.comments??""}/></label>
    {error&&<div className="form-error span-2">{error}</div>}<div className="span-2"><button className="button primary">{request?"Сохранить изменения":"Создать заявку"}</button></div>
  </form>;
}
