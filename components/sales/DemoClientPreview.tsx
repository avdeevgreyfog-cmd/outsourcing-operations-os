"use client";

import type {ClientRow} from "@/lib/data/service";

const PREFIX="operis:clients:preview:";
export function demoClientSnapshotKey(scope:string,id:string){return `${PREFIX}${scope}:${id}`;}
export function loadDemoClientSnapshot(scope:string,id:string):ClientRow|null{
  if(typeof window==="undefined")return null;
  try{
    const raw=sessionStorage.getItem(demoClientSnapshotKey(scope,id));
    const snapshot=raw?JSON.parse(raw):null,row=snapshot?.row;
    return snapshot?.scope===scope&&row?.id===id&&typeof row?.name==="string"&&typeof row?.organizationId==="string"&&typeof row?.status==="string"?row:null;
  }catch{return null;}
}
export function saveDemoClientSnapshot(scope:string,row:ClientRow,modified=false):boolean{
  if(typeof window==="undefined")return false;
  try{
    const key=demoClientSnapshotKey(scope,row.id),previous=JSON.parse(sessionStorage.getItem(key)??"null");
    sessionStorage.setItem(key,JSON.stringify({scope,row,modified:modified||previous?.modified===true}));return true;
  }catch{return false;}
}
export function loadDemoClientRows(scope:string):ClientRow[]{
  if(typeof window==="undefined")return [];
  const rows:ClientRow[]=[];
  try{for(let index=0;index<sessionStorage.length;index++){
    const key=sessionStorage.key(index);if(!key?.startsWith(`${PREFIX}${scope}:`))continue;
    const snapshot=JSON.parse(sessionStorage.getItem(key)??"null");
    const row=loadDemoClientSnapshot(scope,snapshot?.row?.id);
    if(snapshot?.modified===true&&row)rows.push(row);
  }}catch{}
  return rows;
}
