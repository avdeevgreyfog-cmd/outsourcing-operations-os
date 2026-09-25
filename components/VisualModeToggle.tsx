"use client";

import {useEffect,useState} from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";

type VisualMode="classic"|"new";
const STORAGE_KEY="operis.visualMode";
const COOKIE_KEY="oo_ui";

export function VisualModeToggle({initialMode}:{initialMode:VisualMode}){
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const router=useRouter();
  const [mode,setMode]=useState<VisualMode>(initialMode);

  useEffect(()=>{
    document.documentElement.dataset.operisUi=mode;
    if(/^\/objects\/[^/]+$/.test(pathname)){
      const expected=mode==="classic"?"classic":"pilot";
      if(searchParams.get("ui")!==expected){
        const params=new URLSearchParams(searchParams.toString());
        params.set("ui",expected);
        router.replace(`${pathname}?${params.toString()}`,{scroll:false});
      }
    }
  },[mode,pathname,router,searchParams]);

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
