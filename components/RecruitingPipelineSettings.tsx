"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Settings2, X } from "lucide-react";
import type { RecruitingPipelineStage } from "@/lib/recruiting/service";

export function RecruitingPipelineSettings({
  stages,
  canConfigure,
  demo,
  onSaved,
}:{stages:RecruitingPipelineStage[];canConfigure:boolean;demo:boolean;onSaved:(stages:RecruitingPipelineStage[])=>void}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(stages);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  function move(index:number,direction:-1|1){
    const next=[...draft];
    const target=index+direction;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    setDraft(next.map((item,order)=>({...item,sortOrder:(order+1)*10})));
  }

  async function save(){
    if(demo){
      onSaved(draft);
      setOpen(false);
      return;
    }
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/recruiting/pipeline",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({stages:draft.map(item=>({stageCode:item.stageCode,label:item.label,sortOrder:item.sortOrder,active:item.active}))})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось сохранить этапы");
      onSaved(draft);
      setOpen(false);
    }catch(value){setError(value instanceof Error?value.message:"Не удалось сохранить этапы");}
    finally{setSaving(false);}
  }

  if(!canConfigure)return null;
  return <>
    <button type="button" className="button" onClick={()=>{setDraft(stages);setError("");setOpen(true)}}><Settings2 size={14}/> Настроить воронку</button>
    {open&&<div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}>
      <div className="recruiting-modal-card recruiting-pipeline-settings">
        <div className="recruiting-modal-head">
          <div><h2>Настройка воронки</h2><p>Названия и порядок настраиваются для компании. Внутренние коды сохраняются, поэтому история и аналитика не ломаются.</p></div>
          <button type="button" className="icon-button" onClick={()=>setOpen(false)}><X size={17}/></button>
        </div>
        <div className="pipeline-settings-list">
          {draft.map((stage,index)=><div className="pipeline-settings-row" key={stage.stageCode}>
            <span className="pipeline-settings-order">{index+1}</span>
            <input value={stage.label} onChange={event=>setDraft(current=>current.map(item=>item.stageCode===stage.stageCode?{...item,label:event.target.value}:item))}/>
            <span className="pipeline-settings-kind">{stage.virtual?"Автоматически":"Рабочий этап"}</span>
            <label className="pipeline-settings-toggle"><input type="checkbox" checked={stage.active} onChange={event=>setDraft(current=>current.map(item=>item.stageCode===stage.stageCode?{...item,active:event.target.checked}:item))}/><span>Показывать</span></label>
            <div className="pipeline-settings-move">
              <button type="button" className="icon-button" onClick={()=>move(index,-1)} disabled={index===0} aria-label="Поднять этап"><ArrowUp size={14}/></button>
              <button type="button" className="icon-button" onClick={()=>move(index,1)} disabled={index===draft.length-1} aria-label="Опустить этап"><ArrowDown size={14}/></button>
            </div>
          </div>)}
        </div>
        {error&&<div className="recruiting-error">{error}</div>}
        <div className="recruiting-form-actions">
          <button type="button" className="button" onClick={()=>setOpen(false)}>Отмена</button>
          <button type="button" className="button primary" disabled={saving||draft.some(item=>!item.label.trim())} onClick={save}>{saving?"Сохраняю…":"Сохранить воронку"}</button>
        </div>
      </div>
    </div>}
  </>;
}
