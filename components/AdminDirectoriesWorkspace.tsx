"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {Pencil,Plus,X} from "lucide-react";
import {Section,Status} from "@/components/UI";
import type {ReferenceRegion,ReferenceSpecialty} from "@/lib/admin/reference-directories";

type EditState={kind:"region"|"specialty";id:string;name:string;aliases:string;active:boolean}|null;

export function AdminDirectoriesWorkspace({regions,specialties,demo}:{regions:ReferenceRegion[];specialties:ReferenceSpecialty[];demo:boolean}){
  const router=useRouter();
  const [regionName,setRegionName]=useState("");
  const [specialtyName,setSpecialtyName]=useState("");
  const [specialtyAliases,setSpecialtyAliases]=useState("");
  const [edit,setEdit]=useState<EditState>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  async function create(kind:"region"|"specialty",event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");
    const name=kind==="region"?regionName:specialtyName;
    if(name.trim().length<2){setError("Укажите название.");return}
    setBusy("create:"+kind);
    try{
      const response=await fetch("/api/admin/directories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,name,aliases:kind==="specialty"?splitAliases(specialtyAliases):undefined})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось сохранить");
      if(kind==="region")setRegionName("");else{setSpecialtyName("");setSpecialtyAliases("")}
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить")}finally{setBusy("")}
  }

  async function saveEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!edit)return;
    setBusy("edit");
    setError("");
    try{
      const response=await fetch("/api/admin/directories",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({kind:edit.kind,id:edit.id,name:edit.name,aliases:edit.kind==="specialty"?splitAliases(edit.aliases):undefined,active:edit.kind==="specialty"?edit.active:undefined})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось сохранить");
      setEdit(null);
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить")}finally{setBusy("")}
  }

  return <div className="directory-workspace">
    {demo&&<div className="directory-note">Демо-организация использует учебные справочники. Изменения здесь отключены.</div>}
    {error&&<div className="recruiting-error">{error}</div>}

    <Section title="Регионы" note="Используются в потребностях, объектах, назначениях и региональных правах.">
      {!demo&&<form className="directory-create-row" onSubmit={(event)=>create("region",event)}>
        <input value={regionName} onChange={event=>setRegionName(event.target.value)} placeholder="Например, Приморский край"/>
        <button className="button primary" disabled={busy==="create:region"}><Plus size={14}/> Добавить регион</button>
      </form>}
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Регион</th><th>Код</th><th aria-label="Действия"></th></tr></thead><tbody>
        {regions.map(item=><tr key={item.id}><td className="cell-title">{item.name}</td><td><span className="cell-sub">{item.code}</span></td><td>{!demo&&<button className="icon-button" type="button" onClick={()=>setEdit({kind:"region",id:item.id,name:item.name,aliases:"",active:true})} aria-label={"Изменить "+item.name}><Pencil size={14}/></button>}</td></tr>)}
        {!regions.length&&<tr><td colSpan={3}><span className="cell-sub">Регионов пока нет</span></td></tr>}
      </tbody></table></div>
    </Section>

    <Section title="Специальности" note="Единый список профессий и синонимов для подбора и объектов.">
      {!demo&&<form className="directory-create-grid" onSubmit={(event)=>create("specialty",event)}>
        <input value={specialtyName} onChange={event=>setSpecialtyName(event.target.value)} placeholder="Специальность, например Электромонтажник"/>
        <input value={specialtyAliases} onChange={event=>setSpecialtyAliases(event.target.value)} placeholder="Синонимы через запятую"/>
        <button className="button primary" disabled={busy==="create:specialty"}><Plus size={14}/> Добавить специальность</button>
      </form>}
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Специальность</th><th>Синонимы</th><th>Состояние</th><th aria-label="Действия"></th></tr></thead><tbody>
        {specialties.map(item=><tr key={item.id}><td className="cell-title">{item.name}</td><td><span className="cell-sub">{item.aliases.join(", ")||"—"}</span></td><td><Status tone={item.active?"good":"neutral"}>{item.active?"Активна":"Отключена"}</Status></td><td>{!demo&&<button className="icon-button" type="button" onClick={()=>setEdit({kind:"specialty",id:item.id,name:item.name,aliases:item.aliases.join(", "),active:item.active})} aria-label={"Изменить "+item.name}><Pencil size={14}/></button>}</td></tr>)}
        {!specialties.length&&<tr><td colSpan={4}><span className="cell-sub">Специальностей пока нет</span></td></tr>}
      </tbody></table></div>
    </Section>

    {edit&&<div className="recruiting-modal" onMouseDown={event=>{if(event.target===event.currentTarget)setEdit(null)}}><form className="recruiting-modal-card directory-edit-card" onSubmit={saveEdit}>
      <div className="recruiting-modal-head"><div><h2>{edit.kind==="region"?"Изменить регион":"Изменить специальность"}</h2><p>Идентификатор записи останется прежним, связанные данные не потеряются.</p></div><button type="button" className="icon-button" onClick={()=>setEdit(null)}><X size={17}/></button></div>
      <div className="recruiting-form"><div className="recruiting-form-grid">
        <label className="wide">Название<input value={edit.name} onChange={event=>setEdit(current=>current?{...current,name:event.target.value}:current)} required/></label>
        {edit.kind==="specialty"&&<><label className="wide">Синонимы<input value={edit.aliases} onChange={event=>setEdit(current=>current?{...current,aliases:event.target.value}:current)} placeholder="Через запятую"/></label><label className="wide"><input type="checkbox" checked={edit.active} onChange={event=>setEdit(current=>current?{...current,active:event.target.checked}:current)}/> Специальность активна</label></>}
      </div><div className="recruiting-form-actions"><button type="button" className="button" onClick={()=>setEdit(null)}>Отмена</button><button className="button primary" disabled={busy==="edit"}>{busy==="edit"?"Сохраняю…":"Сохранить"}</button></div></div>
    </form></div>}
  </div>;
}

function splitAliases(value:string){return value.split(",").map(item=>item.trim()).filter(Boolean)}
