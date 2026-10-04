"use client";

import {useId,useRef,useState,type ReactNode} from "react";
import {ChevronDown,Filter,Search,X} from "lucide-react";
import {RegistrySelect} from "./RegistrySelect";

export type RegistryFilter={label:string;value:string;emptyValue:string;options:{value:string;label:string}[];onChange:(value:string)=>void;searchable?:boolean};

/** Shared presentation controls; records and filtering remain owned by each module. */
export function RegistryToolbar({query,onQueryChange,searchLabel,placeholder,quickFilter,filters=[],actions,onReset}:{query:string;onQueryChange:(value:string)=>void;searchLabel:string;placeholder:string;quickFilter?:RegistryFilter;filters?:RegistryFilter[];actions?:ReactNode;onReset:()=>void}){
  const [open,setOpen]=useState(false);
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const active=[...(quickFilter?[quickFilter]:[]),...filters].filter(item=>item.value!==item.emptyValue);
  function close(){setOpen(false);trigger.current?.focus()}
  return <div className="operis-shared-registry-controls" onKeyDown={event=>{if(event.key==="Escape"&&!event.defaultPrevented&&open){event.preventDefault();close()}}}>
    <div className="operis-shared-registry-toolbar">
      <div className="operis-shared-registry-search-group">
        <label className="operis-shared-registry-search"><Search size={16}/><input aria-label={searchLabel} value={query} placeholder={placeholder} onChange={event=>onQueryChange(event.target.value)}/>{query&&<button type="button" aria-label="Очистить поиск" onClick={()=>onQueryChange("")}><X size={14}/></button>}</label>
        {quickFilter&&<RegistrySelect {...quickFilter}/>}
        {filters.length>0&&<button ref={trigger} type="button" className="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><Filter size={15}/> Фильтры{active.length>0&&<span className="operis-shared-filter-count">{active.length}</span>}<ChevronDown size={14}/></button>}
      </div>
      {actions&&<div className="operis-shared-registry-actions">{actions}</div>}
    </div>
    {open&&<section id={id} className="operis-shared-registry-settings" aria-label="Дополнительные фильтры"><header><strong>Фильтры</strong><button type="button" className="icon-button" aria-label="Закрыть фильтры" onClick={close}><X size={16}/></button></header><div className="operis-shared-registry-fields">{filters.map(item=><div key={item.label}><span>{item.label}</span><RegistrySelect {...item}/></div>)}</div></section>}
    {(active.length>0||query)&&<div className="operis-shared-registry-chips">{active.map(item=><button key={item.label} type="button" onClick={()=>item.onChange(item.emptyValue)} aria-label={`Сбросить ${item.label}`}><span>{item.label}: {item.options.find(option=>option.value===item.value)?.label??item.value}</span><X size={12}/></button>)}<button type="button" onClick={onReset}>Сбросить всё</button></div>}
  </div>;
}
