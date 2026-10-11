"use client";

import {useEffect,useRef} from "react";
import {EntityTabs} from "@/components/UI";

export function WorkerProfileTabs({items,active}:{items:Array<{label:string;href:string}>;active:string}){
  const root=useRef<HTMLDivElement>(null);
  const reveal=()=>{
    const nav=root.current?.querySelector<HTMLElement>(".entity-tabs");
    const selected=nav?.querySelector<HTMLElement>("a.active");
    if(!nav||!selected)return;
    const bounds=nav.getBoundingClientRect(),target=selected.getBoundingClientRect();
    if(target.right>bounds.right)nav.scrollLeft+=target.right-bounds.right+12;
    else if(target.left<bounds.left)nav.scrollLeft-=bounds.left-target.left+12;
  };
  useEffect(()=>{reveal();},[active]);
  return <div ref={root} onClick={()=>requestAnimationFrame(reveal)}><EntityTabs items={items} active={active}/></div>;
}
