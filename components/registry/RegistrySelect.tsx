"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {Check,ChevronDown,Search} from "lucide-react";

type Option={value:string;label:string};
/** Anchored choice list; form settings remain in the document flow. */
export function RegistrySelect({label,value,onChange,options,disabled=false,searchable=false}:{label:string;value:string;onChange:(value:string)=>void;options:Option[];disabled?:boolean;searchable?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState("");const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null);
 const filtered=options.filter(option=>option.label.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
 useEffect(()=>{if(!open)return;const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[open]);
 useEffect(()=>{if(open){const input=root.current?.querySelector<HTMLInputElement>("input");if(input)input.focus();else list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()}},[open]);
 function select(next:string){onChange(next);setOpen(false);setQuery("");trigger.current?.focus()}
 function keys(event:KeyboardEvent){
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return}
  if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  event.preventDefault();if(!open){setOpen(true);return}
  const buttons=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')??[]);const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const index=event.key==="Home"?0:event.key==="End"?buttons.length-1:event.key==="ArrowDown"?Math.min(buttons.length-1,current+1):Math.max(0,current-1);buttons[index]?.focus();
 }
 return <div className="operis-select" ref={root} onKeyDown={keys} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false)}}>
  <button type="button" className="button operis-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} ref={trigger} onClick={()=>{setQuery("");setOpen(!open)}}><span>{options.find(option=>option.value===value)?.label??"Не выбрано"}</span><ChevronDown size={14}/></button>
  {open&&<div className="operis-choice-dropdown">{searchable&&<label className="operis-choice-search"><Search size={14}/><input aria-label={`Поиск: ${label}`} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Найти…"/></label>}<div id={id} role="listbox" aria-label={label} ref={list}>{filtered.map(option=><button type="button" key={option.value} role="option" aria-selected={option.value===value} onClick={()=>select(option.value)}><span>{option.label}</span>{option.value===value&&<Check size={14}/>}</button>)}{!filtered.length&&<span className="operis-choice-empty">Ничего не найдено</span>}</div></div>}
 </div>
}
