"use client";
import { useEffect } from "react";

export function ClientRecoveryReset(){
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      try{
        for(let i=window.sessionStorage.length-1;i>=0;i--){
          const key=window.sessionStorage.key(i);
          if(key?.startsWith("operis:hard-recovery:")) window.sessionStorage.removeItem(key);
        }
      }catch{}
    },1200);
    return ()=>window.clearTimeout(timer);
  },[]);
  return null;
}
