"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { RequestIntakeWorkspacePolished } from "@/components/RequestIntakeWorkspacePolished";
import type { RateMemoryRow } from "@/lib/commercial/rate-references";

const RATE_STORAGE_KEY="operis.rate-memory.v1";
const RATE_STORAGE_EVENT="operis:rate-memory";
type Props = ComponentProps<typeof RequestIntakeWorkspacePolished>;
function localRateRows(){
  try{const value=JSON.parse(window.localStorage.getItem(RATE_STORAGE_KEY)??"[]") as RateMemoryRow[];return Array.isArray(value)?value:[];}catch{return [];}
}
function bounds(values:Array<number|null|undefined>){const finite=values.filter((value):value is number=>value!=null&&Number.isFinite(value));return finite.length?[Math.min(...finite),Math.max(...finite)] as const:[null,null] as const;}

export function RequestIntakeFinalShell(props: Props) {
  const [rateRows,setRateRows]=useState<RateMemoryRow[]>([]);

  useEffect(()=>{
    if(!props.demo)return;
    const sync=()=>setRateRows(localRateRows());
    const timer=window.setTimeout(sync,0);
    window.addEventListener(RATE_STORAGE_EVENT,sync);window.addEventListener("storage",sync);
    return()=>{window.clearTimeout(timer);window.removeEventListener(RATE_STORAGE_EVENT,sync);window.removeEventListener("storage",sync);};
  },[props.demo]);

  const workspaceProps=useMemo<Props>(()=>{
    if(!props.demo||!rateRows.length)return props;
    const specialties=props.options.specialties.map(item=>{
      const matching=rateRows.filter(row=>row.specialty.trim().toLowerCase()===item.name.trim().toLowerCase());
      if(!matching.length)return item;
      const [localWorkerMin,localWorkerMax]=bounds(matching.flatMap(row=>[row.amountMin,row.amountMax]));
      const [localClientMin,localClientMax]=bounds(matching.flatMap(row=>[row.clientRateMin,row.clientRateMax]));
      const workerMin=bounds([item.stats.workerPayMin,localWorkerMin])[0];
      const workerMax=bounds([item.stats.workerPayMax,localWorkerMax])[1];
      const clientMin=bounds([item.stats.clientRateMin,localClientMin])[0];
      const clientMax=bounds([item.stats.clientRateMax,localClientMax])[1];
      const clientValues=matching.flatMap(row=>[row.clientRateMin,row.clientRateMax]).filter((value):value is number=>value!=null&&Number.isFinite(value));
      const localMid=clientValues.length?clientValues.reduce((sum,value)=>sum+value,0)/clientValues.length:null;
      return {...item,stats:{...item.stats,sampleCount:item.stats.sampleCount+matching.length,workerPayMin:workerMin,workerPayMax:workerMax,clientRateMin:clientMin,clientRateMax:clientMax,clientRateMedian:item.stats.clientRateMedian??localMid}};
    });
    return {...props,options:{...props.options,specialties}};
  },[props,rateRows]);

  return <div className="request-final-editor-shell request-baseline-editor request-intake-unified">
    <div className="request-final-editor-main"><RequestIntakeWorkspacePolished {...workspaceProps}/></div>
  </div>;
}
