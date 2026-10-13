"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
const QuickStartImportWizard=dynamic(()=>import("@/components/QuickStartImportWizard"),{ssr:false});
import { ObjectQuickCreateButton } from "@/components/ObjectQuickCreateButton";
import type { WorkerRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";
import { WorkersRegistry } from "@/components/registry/WorkersRegistry";
import { RegistryDrawer } from "@/components/registry/RegistryDrawer";

type FormState={fullName:string;phone:string;email:string;city:string;birthDate:string;objectId:string;specialtyId:string;specialtyName:string;startDate:string;relationType:""|"employment"|"gph"|"npd"|"custom";rate:string;rateUnit:""|"hour"|"shift"|"month";workMode:""|"local"|"rotation";paidHoursPerShift:string;clothingSize:string;shoeSize:string;heightCm:string;notes:string};
const blank=():FormState=>({fullName:"",phone:"",email:"",city:"",birthDate:"",objectId:"",specialtyId:"",specialtyName:"",startDate:"",relationType:"",rate:"",rateUnit:"",workMode:"",paidHoursPerShift:"",clothingSize:"",shoeSize:"",heightCm:"",notes:""});

export function WorkersWorkspace({rows,options,sensitive,canEdit,canManageDirectories,demo,preferenceScope}:{rows:WorkerRow[];options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;canManageDirectories:boolean;demo:boolean;preferenceScope:string}){
  const [localRows,setLocalRows]=useState(rows);
  const [showCreate,setShowCreate]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [form,setForm]=useState<FormState>(blank());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [objectOptions,setObjectOptions]=useState(options.objects);
  async function createWorker(){
    setBusy(true);setError("");
    try{
      if(!form.fullName.trim())throw new Error("Укажите ФИО");
      if(form.rate && (!Number.isFinite(Number(form.rate)) || Number(form.rate)<=0))throw new Error("Ставка должна быть больше нуля");
      if(form.objectId&&(form.specialtyId!=="__new"?form.specialtyId:form.specialtyName.trim())&&form.startDate&&form.rateUnit==="shift" && form.rate && (!Number.isFinite(Number(form.paidHoursPerShift))||Number(form.paidHoursPerShift)<0.5||Number(form.paidHoursPerShift)>24))throw new Error("Укажите оплачиваемые часы в смене от 0,5 до 24");
      if(demo){
        const object=objectOptions.find(x=>x.id===form.objectId);
        const specialty=options.specialties.find(x=>x.id===form.specialtyId);
        const assigned=Boolean(form.objectId&&(form.specialtyId!=="__new"?form.specialtyId:form.specialtyName.trim())&&form.startDate);
        setLocalRows(current=>[{id:crypto.randomUUID(),organizationId:"demo",fullName:form.fullName.trim(),phone:form.phone||null,status:assigned?"active":"requires_assignment",source:"Ручное создание",object:assigned?object?.name??null:null,objectId:assigned?object?.id:null,ownerUserId:object?.ownerUserId??undefined,assigneeUserIds:object?.assigneeUserIds??[],managerName:object?.ownerName??null,specialty:assigned?specialty?.name??(form.specialtyName||null):null,specialtyId:assigned?specialty?.id??null:null,startDate:assigned?form.startDate:null,employment:form.relationType||null,workMode:form.workMode||null,paidHoursPerShift:form.paidHoursPerShift?Number(form.paidHoursPerShift):null,rate:form.rate?Number(form.rate):null,rateUnit:form.rateUnit||null,accrued:null,paid:null,payable:null},...current]);
      }else{
        const response=await fetch("/api/workers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          ...form,rateUnit:form.rateUnit||null,workMode:form.workMode||null,startDate:form.startDate||null,relationType:form.relationType||null,specialtyName:form.specialtyName||null,phone:form.phone||null,email:form.email||null,city:form.city||null,birthDate:form.birthDate||null,
          objectId:form.objectId||null,specialtyId:form.specialtyId&&form.specialtyId!=="__new"?form.specialtyId:null,rate:form.rate?Number(form.rate):null,paidHoursPerShift:form.paidHoursPerShift?Number(form.paidHoursPerShift):null,
          clothingSize:form.clothingSize||null,shoeSize:form.shoeSize||null,heightCm:form.heightCm?Number(form.heightCm):null,notes:form.notes||null,
        })});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось создать сотрудника");
        window.location.reload();
      }
      setShowCreate(false);setForm(blank());
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать сотрудника");}
    finally{setBusy(false);}
  }

  return <div className="workers-portfolio-workspace">
    <WorkersRegistry rows={localRows} sensitive={sensitive} canEdit={canEdit} preferenceScope={preferenceScope} onCreate={()=>{setError("");setShowCreate(true)}} onImport={()=>{setError("");setShowImport(true)}}/>
    {showCreate&&<RegistryDrawer title="Новый сотрудник" subtitle="Для сохранения достаточно ФИО. Назначение можно заполнить позднее" onClose={()=>{if(!busy)setShowCreate(false)}} footer={<><button className="button" disabled={busy} onClick={()=>setShowCreate(false)}>Отмена</button><button className="button primary" disabled={busy||!form.fullName.trim()} onClick={()=>void createWorker()}>{busy?"Сохраняю…":"Создать сотрудника"}</button></>}>
      <div className="operis-drawer-section"><h3>Личные данные и назначение</h3></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>ФИО *<input required autoComplete="name" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label>
        <label>Телефон<input type="tel" autoComplete="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Email<input type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Город<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
        <label>Дата рождения<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})}/></label>
        <label>Объект<select value={form.objectId} onChange={e=>setForm({...form,objectId:e.target.value})}><option value="">Без назначения</option>{objectOptions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><ObjectQuickCreateButton demo={demo} onCreated={object=>{setObjectOptions(current=>[...current,{...object,region:null,ownerUserId:null,ownerName:null,assigneeUserIds:[]}]);setForm(current=>({...current,objectId:object.id}))}}/></label>
        <label>Специальность<select value={form.specialtyId} onChange={e=>setForm({...form,specialtyId:e.target.value})}><option value="">Выберите</option>{options.specialties.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}{canManageDirectories&&<option value="__new">Создать специальность</option>}</select></label>{form.specialtyId==="__new"&&<label>Новая специальность<input value={form.specialtyName} onChange={e=>setForm({...form,specialtyName:e.target.value})} placeholder="Введите специальность"/></label>}
        <label>Дата начала<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/>{!form.startDate&&<small>Дата неизвестна</small>}</label>
        <label>Формат работы<select value={form.workMode} onChange={e=>setForm({...form,workMode:e.target.value as FormState["workMode"]})}><option value="">Не указано</option><option value="local">Местный</option><option value="rotation">Вахта</option></select></label>
        <label>Оформление<select value={form.relationType} onChange={e=>setForm({...form,relationType:e.target.value as FormState["relationType"]})}><option value="">Не указано</option><option value="employment">Трудовой договор</option><option value="gph">ГПХ</option><option value="npd">Самозанятый</option><option value="custom">Другое</option></select></label>
        <label>Ставка<input type="number" min="0" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label>
        <label>Единица<select value={form.rateUnit} onChange={e=>setForm({...form,rateUnit:e.target.value as FormState["rateUnit"]})}><option value="">Не указано</option><option value="hour">₽/час</option><option value="shift">₽/смену</option><option value="month">₽/месяц</option></select></label>
        {form.rateUnit==="shift"&&<label>Оплачиваемых часов в смене<input type="number" min="0.5" max="24" step="0.5" value={form.paidHoursPerShift} onChange={e=>setForm({...form,paidHoursPerShift:e.target.value})} placeholder="Например, 11"/></label>}
        <label>Размер одежды<input value={form.clothingSize} onChange={e=>setForm({...form,clothingSize:e.target.value})}/></label>
        <label>Размер обуви<input value={form.shoeSize} onChange={e=>setForm({...form,shoeSize:e.target.value})}/></label>
<label>Рост, см<input type="number" min="1" max="250" value={form.heightCm} onChange={e=>setForm({...form,heightCm:e.target.value})}/></label><label className="operis-form-full">Примечание<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </div>{!(form.objectId&&(form.specialtyId!=="__new"?form.specialtyId:form.specialtyName)&&form.startDate)&&<p className="form-hint">Требует назначения: объект, специальность и дата начала. До назначения планы, часы и персональная ссылка недоступны.</p>}{error&&<div className="recruiting-error">{error}</div>}</div>
    </RegistryDrawer>}

    {showImport&&<QuickStartImportWizard demo={demo} onClose={()=>setShowImport(false)} onDone={()=>window.location.reload()}/>}
  </div>;
}
