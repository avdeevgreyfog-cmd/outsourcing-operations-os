"use client";

import {useEffect,useState} from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";

type VisualMode="classic"|"new";
const STORAGE_KEY="operis.visualMode";
const COOKIE_KEY="oo_ui";

export function VisualModeToggle(){
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const router=useRouter();
  const [mode,setMode]=useState<VisualMode>("new");

  useEffect(()=>{
    let next:VisualMode="new";
    try{
      const saved=window.localStorage.getItem(STORAGE_KEY);
      if(saved==="classic"||saved==="new")next=saved;
    }catch{}
    setMode(next);
    document.documentElement.dataset.operisUi=next;
  },[]);

  function choose(next:VisualMode){
    setMode(next);
    document.documentElement.dataset.operisUi=next;
    try{window.localStorage.setItem(STORAGE_KEY,next)}catch{}
    document.cookie=`${COOKIE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    if(/^\/objects\/[^/]+$/.test(pathname)){
      const params=new URLSearchParams(searchParams.toString());
      params.set("ui",next==="classic"?"classic":"pilot");
      router.replace(`${pathname}?${params.toString()}`,{scroll:false});
      return;
    }
    router.refresh();
  }

  return <div className="visual-mode-toggle" role="group" aria-label="Вариант интерфейса">
    <button type="button" className={mode==="classic"?"active":""} onClick={()=>choose("classic")} aria-pressed={mode==="classic"}>Классический</button>
    <button type="button" className={mode==="new"?"active":""} onClick={()=>choose("new")} aria-pressed={mode==="new"}>Новый</button>
  </div>;
}
