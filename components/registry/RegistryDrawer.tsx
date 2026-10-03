"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Shared 560px shell for quick view and simple create. */
export function RegistryDrawer({title, subtitle, children, footer, onClose}: {title:string; subtitle?:string; children:React.ReactNode; footer:React.ReactNode; onClose:()=>void}) {
  const ref=useRef<HTMLElement>(null);
  const close=useRef(onClose);
  const id=useId();
  useEffect(()=>{close.current=onClose},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    ref.current?.querySelector<HTMLElement>("button,input,select,a[href]")?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){e.preventDefault();close.current();}
      if(e.key!=="Tab")return;
      const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')??[]).filter(n=>n.getClientRects().length);
      const first=nodes[0], last=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    };
    document.addEventListener("keydown",key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",key);previous?.focus()};
  },[]);
  return createPortal(<div className="operis-registry-layer" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className="operis-registry-drawer" ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header><div><h2 id={id}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть панель"><X size={18}/></button></header>
      <div className="operis-registry-drawer-body">{children}</div><footer>{footer}</footer>
    </aside>
  </div>,document.body);
}
