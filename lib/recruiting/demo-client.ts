'use client';
import { useEffect, useMemo, useState } from 'react';
import type { RecruitingApplicationRow } from './service';
export const applicationStorage='operis.recruiting.applications.v2';
export const recruitingEvent='operis:recruiting-changed';
export function readDemoApplications():RecruitingApplicationRow[] { try {const value=JSON.parse(localStorage.getItem(applicationStorage)??'[]');return Array.isArray(value)?value:[];}catch{return [];} }
export function saveDemoApplication(row:RecruitingApplicationRow) {
  const rows=readDemoApplications().filter(x=>x.applicationId!==row.applicationId && !(x.candidateId===row.candidateId&&x.needId===row.needId));
  localStorage.setItem(applicationStorage,JSON.stringify([row,...rows]));window.dispatchEvent(new Event(recruitingEvent));
}
export function mergeDemoApplications(base:RecruitingApplicationRow[], overrides:RecruitingApplicationRow[]) {
  const remaining=[...overrides];
  const rows=base.map(row=>{const index=remaining.findIndex(x=>x.applicationId===row.applicationId || (x.candidateId===row.candidateId&&x.needId===row.needId));if(index<0)return row;const [patch]=remaining.splice(index,1);return {...row,...patch,applicationId:row.applicationId};});
  return [...remaining,...rows].sort((a,b)=>Date.parse(b.updatedAt??'1970-01-01')-Date.parse(a.updatedAt??'1970-01-01'));
}
export function useRecruitingApplications(rows:RecruitingApplicationRow[],demo:boolean) {
  const [local,setLocal]=useState<RecruitingApplicationRow[]>([]);
  useEffect(()=>{if(!demo)return;const refresh=()=>setLocal(readDemoApplications());const frame=requestAnimationFrame(refresh);window.addEventListener(recruitingEvent,refresh);window.addEventListener('storage',refresh);return()=>{cancelAnimationFrame(frame);window.removeEventListener(recruitingEvent,refresh);window.removeEventListener('storage',refresh);};},[demo]);
  return useMemo(()=>demo?mergeDemoApplications(rows,local):rows,[rows,local,demo]);
}
