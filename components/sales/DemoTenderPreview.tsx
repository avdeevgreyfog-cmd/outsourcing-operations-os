"use client";

import type {TenderRow,TenderDetail} from "@/lib/tenders/service";

export const DEMO_TENDER_PREVIEW_PREFIX="operis:tenders:preview:";
export function demoTenderSnapshotKey(scope:string,id:string){return `${DEMO_TENDER_PREVIEW_PREFIX}${scope}:${id}`;}
export function loadDemoTenderSnapshot(scope:string,id:string):(TenderRow&Partial<TenderDetail>)|null{
  if(typeof window==="undefined")return null;
  try{
    const raw=sessionStorage.getItem(demoTenderSnapshotKey(scope,id));
    const snapshot=raw?JSON.parse(raw):null;
    const row=snapshot?.row;
    return snapshot?.scope===scope&&row?.id===id&&typeof row?.title==="string"?row:null;
  }catch{return null;}
}
export function saveDemoTenderSnapshot(scope:string,row:TenderRow):boolean{
  if(typeof window==="undefined")return false;
  try{sessionStorage.setItem(demoTenderSnapshotKey(scope,row.id),JSON.stringify({scope,row:{...loadDemoTenderSnapshot(scope,row.id),...row}}));window.dispatchEvent(new Event("operis:demo-tender-edit"));return true;}catch{return false;}
}
